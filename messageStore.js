const Redis = require("ioredis"); // 请确保已安装 ioredis 模块

/* 抽象类：MessageStore */
class MessageStore {
    // 保存消息的抽象方法，需要在子类中实现
    async saveMessage(message) {}

    // 查找用户消息的抽象方法，需要在子类中实现
    async findMessagesForUser(userID) {}
}

/* InMemoryMessageStore 类，继承自 MessageStore */
class InMemoryMessageStore extends MessageStore {
    constructor() {
        super();
        // 内存中存储消息的数组
        this.messages = [];
    }

    async saveMessage(message) {
        this.messages.push(message);
        return true;
    }

    async findMessagesForUser(userID) {
        return this.messages.filter((message) => message.userID === userID);
    }
}

/* RedisMessageStore 类，继承自 MessageStore */
class RedisMessageStore extends MessageStore {
    constructor() {
        super();
        // 连接到 Redis 服务器
        this.redis = new Redis();
    }

    async saveMessage(message) {
        try {
            // 将消息添加到用户的聊天记录列表中
            await this.redis.rpush(`chat:${message.from}`, JSON.stringify(message));
            return true;
        } catch (error) {
            console.error("Error saving message to Redis:", error);
            return false;
        }
    }

    async findMessagesForUser(userID) {
        try {
            // 获取用户的聊天记录列表
            const chatRecords = await this.redis.lrange(`chat:${userID}`, 0, -1);
            return chatRecords.map(JSON.parse);
        } catch (error) {
            console.error("Error finding messages for user in Redis:", error);
            return [];
        }
    }
}

module.exports = {
    InMemoryMessageStore,
    RedisMessageStore
};
