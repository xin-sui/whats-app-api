const axios = require("axios");
const Redis = require("ioredis");
const redisClient = new Redis();
const {RedisSessionStore} = require("./sessionStore");
const sessionStore = new RedisSessionStore(redisClient);

const {RedisMessageStore} = require("./messageStore");
const messageStore = new RedisMessageStore(redisClient);

class whatsApp {
    //验证token
    VERIFY_TOKEN = "GOOD";

    //whatsApp token
    WHATSAPP_TOKEN =
        "EAALDqgjdv3oBO1DjbNI4oDnP05LpjDSm9re5b6SZApcfl6SASvZBE7j6ZC3jRsHOuRFJZAtZBZCQ1txcjkLQIOwmHoDis270fseYFX7t4QeNeR0kN94dVLzr50HXOGG7Hfa4gsxxpaTgg2Dg2Cvx6c4Q8Xn9pQmxcWBBUWS6e9ZAJat7LhG78HicOIfzNLZABDADNq28qruq49zov74zuCbIEbFfOvFQ";

    async sendMessage(content, phoneId, userID) {
        const data = {
            messaging_product: "whatsapp",
            to: "6285600613236",
            text: {
                preview_url: true,
                body: content
            }
        };

        const config = {
            headers: {
                Authorization: `Bearer ${this.WHATSAPP_TOKEN}`,
                "Content-Type": "application/json"
            }
        };
        await axios
            .post(`https://graph.facebook.com/v17.0/${phoneId}/messages`, data, config)
            .then((response) => {
                if (response.status) {
                    return true;
                }
            })
            .catch((error) => {
                console.error("Error:", error);
            });
    }
    async sendTemplate(phoneId, IP, phone, email) {
        const data = {
            messaging_product: "whatsapp",
            to: "6285600613236",
            text: {
                preview_url: true,
                body: `=========New Conversation========
    IP Address: ${IP}
    Phone Number: ${phone}
    Email: ${email}
                `
            }
        };

        const config = {
            headers: {
                Authorization: `Bearer ${this.WHATSAPP_TOKEN}`,
                "Content-Type": "application/json"
            }
        };
        await axios
            .post(`https://graph.facebook.com/v17.0/${phoneId}/messages`, data, config)
            .then((response) => {
                if (response.status === 200) {
                    return true;
                }
            })
            .catch((error) => {
                console.error("Error:", error);
            });
    }
    //接收whatsApp发送过来的消息
    async receiveWebhook(req, res, io) {
        const body = req.body;
        console.log(body);
        if (req.body.object) {
            if (
                req.body.entry &&
                req.body.entry[0].changes &&
                req.body.entry[0].changes[0] &&
                req.body.entry[0].changes[0].value.messages &&
                req.body.entry[0].changes[0].value.messages[0]
            ) {
                const phoneId = req.body.entry[0].changes[0].value.metadata.phone_number_id;
                const msg_body = req.body.entry[0].changes[0].value.messages[0].text.body;
                // 获取 expire:${id} 的全部数据
                redisClient.keys("expire:*", async (err, keys) => {
                    if (err) {
                        console.error("Error:", err);
                        return;
                    }

                    for (const key of keys) {
                        const data = await new Promise((resolve, reject) => {
                            redisClient.hgetall(key, (err, reply) => {
                                if (err) {
                                    reject(err);
                                    return;
                                }
                                resolve(reply);
                            });
                        });
                        if (data && data.phoneId === phoneId) {
                            io.to(data.userID).emit("private message", msg_body);
                            // const message = {
                            //     content: msg_body,
                            //     from: data.userID,
                            //     receiver: true,
                            //     timestamp: new Date().getTime()
                            // };
                            // messageStore.saveMessage(message);
                        }
                    }
                });
            }
            res.sendStatus(200);
        } else {
            res.sendStatus(404);
        }
    }
    //验证whatsApp
    async sendWebhook(req, res) {
        const verify_token = this.VERIFY_TOKEN;
        const mode = req.query["hub.mode"];
        const token = req.query["hub.verify_token"];
        const challenge = req.query["hub.challenge"];

        if (mode && token) {
            if (mode === "subscribe" && token === verify_token) {
                console.log("WEBHOOK_VERIFIED");
                res.status(200).send(challenge);
            } else {
                res.sendStatus(403);
            }
        }
    }
}
module.exports = {
    whatsApp
};
