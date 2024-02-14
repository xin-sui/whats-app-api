const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");

const cors = require("cors");
const app = express();
const http = require("http");
const httpServer = http.createServer(app);
const Redis = require("ioredis");
const redisClient = new Redis();
const {sendChatGpt} = require("./openai");
const {whatsApp} = require("./whatsApp");
const whatsappInstance = new whatsApp();
const RedisUtils = require("./Redis");
const {sendEmail} = require("./sendEmai");
app.use(bodyParser.json());
app.use(express.json());
httpServer.listen(process.env.PORT || 1337, () => console.log("Webhook 正在监听"));

const io = require("socket.io")(httpServer, {
    allowEIO3: true
    // cors: {
    //     origin: "*"
    // }
});

app.use(cors());

const {RedisSessionStore} = require("./sessionStore");
const sessionStore = new RedisSessionStore(redisClient);

const {RedisMessageStore} = require("./messageStore");
const messageStore = new RedisMessageStore(redisClient);

//初始化phoneID
const initializePhoneIdPool = async () => {
    try {
        await redisClient.flushall();
        const initialIds = ["1_145684965302436"]; // 初始的 PhoneId 池（带有序号）
        await redisClient.sadd("ID_POOL_KEY", initialIds);

        const reply = await redisClient.sinter("ID_USED_KEY", "ID_POOL_KEY");

        if (reply.length > 0) {
            await redisClient.srem("ID_POOL_KEY", ...reply);
            console.log("已从ID_POOL_KEY中删除成员");
        } else {
            console.log("ID_POOL_KEY中无需删除的成员");
        }
    } catch (error) {
        console.error("Error:", error);
    }
};

initializePhoneIdPool();
const ID_POOL_KEY = "ID_POOL_KEY"; // 键：存储可用的 phoneID
const ID_USED_KEY = "ID_USED_KEY"; // 键：存储已分配的 phoneID

// 新增函数：从 Redis 获取可用的 phoneID
const getAvailablePhoneId = async () => {
    const phoneId = await redisClient.spop(ID_POOL_KEY);
    if (phoneId) {
        await redisClient.sadd(ID_USED_KEY, phoneId);
        return phoneId;
    }
    return null;
};

// 新增函数：释放已使用的 phoneID
const releasePhoneId = async (phoneId) => {
    await redisClient.srem(ID_USED_KEY, phoneId);
    await redisClient.sadd(ID_POOL_KEY, phoneId);
};
//验证用户是否有userID
io.use(async (socket, next) => {
    // 获取socket的握手认证信息中的userID
    const userID = socket.handshake.auth.userID;
    // 获取socket的握手认证信息中的IP
    const IP = socket.handshake.auth.IP;
    // 获取socket的握手认证信息中的phone
    const phone = socket.handshake.auth.phone;
    // 获取socket的握手认证信息中的email
    const email = socket.handshake.auth.email;
    // 判断userID、IP、phone、email是否都存在
    if (userID && IP && phone && email) {
        // 将userID赋值给socket
        socket.userID = userID;
        // 将IP赋值给socket
        socket.IP = IP;
        // 将phone赋值给socket
        socket.phone = phone;
        // 将email赋值给socket
        socket.email = email;
        // 查找session
        const session = await sessionStore.findSession(userID);
        // 判断session是否存在
        if (session) {
            // 将session中的phoneId赋值给socket
            socket.phoneId = session.phoneId;
            // 将session中的sequence赋值给socket
            socket.sequence = session.sequence;
        }
        // 调用next函数
        return next();
    } else {
        // 创建一个错误
        const err = new Error("not authorized");
        // 调用next函数
        next(err);
    }
});

io.on("connection", async (socket) => {
    try {
        // 如果socket.sequence和socket.phoneId都存在，则将用户信息发送给客户端
        // 判断socket对象是否有sequence和phoneId属性
        if (socket.sequence && socket.phoneId) {
            // 创建一个userInfo对象，用于存储socket的userID、sequence和phoneId
            const userInfo = {
                userID: socket.userID,
                sequence: socket.sequence,
                phoneId: socket.phoneId
            };
            // 向服务器发送session事件，并传入userInfo对象
            await socket.emit("session", userInfo);
            // 向服务器发送no phoneID事件，并传入提示信息和code
            socket.emit("no phoneID", {
                msg: `Linked-Customer Service No.${socket.sequence}`,
                code: 1
            });
        } else {
            // 获取等待队列的长度
            const waitingQueueLength = await redisClient.scard("WAITING_QUEUE");
            // 如果等待队列的长度为0，则从id池中获取一个id
            if (waitingQueueLength === 0) {
                const idPoolLength = await redisClient.scard(ID_POOL_KEY);
                if (idPoolLength > 0) {
                    // let _nx = await RedisUtils.setNX("user:" + socket.userID, 1, 1);
                    // if (_nx != "OK") {
                    //     return socket.emit("no phoneID", {msg: "频繁操作", code: 0});
                    // }
                    // 获取可用的电话ID
                    const phoneId = await getAvailablePhoneId();
                    if (phoneId) {
                        // 将序号和id拆分
                        const [sequence, id] = phoneId.split("_");
                        socket.phoneId = id;
                        socket.sequence = sequence; // 将序号存储在socket中
                        await whatsappInstance.sendTemplate(
                            // socket.userID,
                            socket.phoneId,
                            socket.IP,
                            socket.phone,
                            socket.email
                        );
                        const userInfo = {
                            userID: socket.userID,
                            sequence: socket.sequence,
                            phoneId: socket.phoneId
                        };
                        // 向服务器发送"session"事件，并传入userInfo
                        await socket.emit("session", userInfo);
                        // 设置socket的userID的会话过期时间
                        await sessionStore.setSessionExpiration(socket.userID, userInfo);
                        // 保存socket的userID的会话信息，并将connected设置为true
                        await sessionStore.saveSession(socket.userID, {
                            ...userInfo,
                            connected: true
                        });

                        socket.emit("no phoneID", {
                            msg: `Linked-Customer Service No.${socket.sequence}`,
                            code: 1
                        });

                        // RedisUtils.del("user:" + socket.userID);
                    }
                } else {
                    // 如果没有可用的 phoneID，将用户放入等待队列
                    await redisClient.sadd("WAITING_QUEUE", socket.id);
                    socket.emit("no phoneID", {
                        msg: "Please wait.",
                        code: 0
                    });
                }
            } else {
                // RedisUtils.del("user:" + socket.userID);
                await redisClient.sadd("WAITING_QUEUE", socket.id);
                socket.emit("no phoneID", {
                    msg: "All phoneIDs are currently in use. Please wait.",
                    code: 0
                });
            }
        }
        socket.join(socket.userID);
        //通过userID查找出该用户的聊天记录
        // const messages = await messageStore.findMessagesForUser(socket.userID);

        // if (messages) {
        //     console.log(messages);

        //     socket.emit("user message", messages);
        // }
        //每5秒循环查找到达时间的用户并通知前端
        setInterval(async () => {
            // 获取所有session
            const [sessions] = await Promise.all([sessionStore.findAllSessions()]);
            // 过滤出connected为true的session
            const filteredSessions = sessions.filter((session) => {
                return session.connected === true;
            });
            // 如果过滤后的session不为空
            if (filteredSessions.length > 0) {
                // 遍历session
                for (const e of filteredSessions) {
                    // 如果session有phoneId和sequence
                    if (e.phoneId && e.sequence) {
                        // 获取session的过期时间
                        const timeOut = await sessionStore.isSessionExpired(e.userID);
                        // 如果过期时间小于0
                        if (timeOut.time < 0) {
                            // 生成完整的id
                            const fullId = `${e.sequence}_${e.phoneId}`;
                            // 释放phoneId
                            await releasePhoneId(fullId);
                            // 删除session
                            await sessionStore.deleteSession(e.userID);
                            // 向客户端发送消息
                            io.to(e.userID).emit("time passes", {
                                msg: ["More than 15 minutes,", " please contact customer service again"],
                                code: 0
                            });
                            // 向手机发送消息
                            await whatsappInstance.sendMessage("==========Disconnected==========", e.phoneId);
                            // 删除当前客户端的session
                            await sessionStore.deleteSession(socket.userID);
                        }
                    }
                }
            }
        }, 5000);
        //
        // // 通知其他用户有新用户连接
        // socket.broadcast.emit("user connected", {
        //     userID: socket.userID,
        //     connected: true,
        //     messages: []
        // });

        // 接收前端发送过来的消息
        socket.on("private message", async (content) => {
            //更新过期时间为5分钟
            await sessionStore.updateSessionExpiration(socket.userID, 900);
            // const message = {
            //     content,
            //     from: socket.userID,
            //     receiver: false,
            //     timestamp: new Date().getTime()
            // };
            //发送消息到 whsatsApp
            await whatsappInstance.sendMessage(content, socket.phoneId, socket.userID);
            //保存聊天信息
            // await messageStore.saveMessage(message);
            // //发送消息到CHTAGPT
            // const stream = await sendChatGpt(content);
            // if (stream.message) {
            //     // return;
            //     return socket.emit("gpt message", stream.status + " 当前对话不可用，请刷新");
            // }

            // let chatGpt = "";
            // for await (const part of stream) {
            //     chatGpt += part.choices[0]?.delta?.content || "";
            // }
            // socket.emit("gpt message", chatGpt);
            // const gptMessage = {
            //     content: chatGpt,
            //     from: socket.userID,
            //     receiver: true,
            //     timestamp: new Date().getTime()
            // };
            // await messageStore.saveMessage(gptMessage);
        });
        //用户断开连接时
        // 当socket断开连接时，执行以下操作
        socket.on("disconnect", async () => {
            // 获取当前socket的userID
            const matchingSockets = await io.in(socket.userID).allSockets();
            // 判断当前socket是否是唯一连接
            const isDisconnected = matchingSockets.size === 0;
            // const [sessions] = await Promise.all([sessionStore.findAllSessions()]);
            if (isDisconnected) {
                // 判断是否有sequence和phoneId
                if (socket.sequence && socket.phoneId) {
                    // 释放phoneId
                    await releasePhoneId(`${socket.sequence}_${socket.phoneId}`);
                    // 向phoneId发送消息
                    await whatsappInstance.sendMessage("==========Disconnected==========", socket.phoneId);
                    // 更新session过期时间
                    await sessionStore.updateSessionExpiration(socket.userID, 0);
                } else {
                    // 从等待队列中移除socket
                    await redisClient.srem("WAITING_QUEUE", socket.id);
                }
                // 删除session
                await sessionStore.deleteSession(socket.userID);
                // 向所有连接的socket发送消息
                socket.broadcast.emit("user disconnected", socket.userID);
            }
            // 判断是否有phoneId
            if (socket.phoneId != null) {
                // 获取等待队列的长度
                const waitingQueueLength = await redisClient.scard("WAITING_QUEUE");
                if (waitingQueueLength > 0) {
                    // 获取可用的phoneId
                    const phoneId = await getAvailablePhoneId();

                    if (phoneId) {
                        // 从等待队列中获取下一个用户ID
                        const nextUserId = await redisClient.spop("WAITING_QUEUE");
                        // 获取下一个用户连接的socket
                        const socketMap = io.sockets.sockets.get(nextUserId);
                        // 获取phoneId
                        const [sequence, id] = phoneId.split("_");
                        // 设置socket的sequence和phoneId
                        socketMap.sequence = sequence;
                        socketMap.phoneId = id;

                        // 设置用户信息
                        const userInfo = {
                            userID: socketMap.userID,
                            sequence: socketMap.sequence,
                            phoneId: socketMap.phoneId
                        };
                        // 向下一个用户发送用户信息
                        await socketMap.emit("session", userInfo);
                        // 更新session过期时间
                        await sessionStore.setSessionExpiration(socketMap.userID, userInfo);
                        // 保存session
                        await sessionStore.saveSession(socketMap.userID, {
                            ...userInfo,
                            connected: true
                        });
                        // 向下一个用户发送消息
                        socketMap.emit("no phoneID", {
                            msg: `Linked-Customer Service No.${socketMap.sequence}`,
                            code: 1
                        });
                    }
                }
            }
        });
    } catch (error) {
        console.log(error);
    }
});
//接收whatsApp发送的消息转发给前端
app.post("/webhook", (req, res) => {
    whatsappInstance.receiveWebhook(req, res, io);
});
//验证
app.get("/webhook", (req, res) => {
    whatsappInstance.sendWebhook(req, res);
});
//发送邮箱
app.post("/sendemail", (req, res) => {
    sendEmail(req, res);
});
