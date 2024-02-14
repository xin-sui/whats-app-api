/* abstract */ class SessionStore {
    findSession(id) {}
    saveSession(id, session) {}
    findAllSessions() {}
}

class InMemorySessionStore extends SessionStore {
    constructor() {
        super();
        this.sessions = new Map();
    }

    findSession(id) {
        return this.sessions.get(id);
    }

    saveSession(id, session) {
        this.sessions.set(id, session);
    }

    findAllSessions() {
        return [...this.sessions.values()];
    }
}

const SESSION_TTL = 24 * 60 * 60;
const mapSession = ([userID, sequence, phoneId, connected]) =>
    userID
        ? {
              userID,
              sequence,
              phoneId,
              connected: connected === "true"
          }
        : undefined;

class RedisSessionStore extends SessionStore {
    constructor(redisClient) {
        super();
        this.redisClient = redisClient;
        this.expirationTime = 1 * 60; // 5分钟的过期时间（以秒为单位）
    }
    findSession(id) {
        return this.redisClient.hmget(`session:${id}`, "userID", "sequence", "phoneId", "connected").then(mapSession);
    }
    //保存用户信息
    async saveSession(id, {userID, sequence, phoneId, connected}) {
        const multi = this.redisClient.multi();
        // 将键和字段值分别添加到多命令事务中
        await multi.hset(`session:${id}`, "userID", userID);
        await multi.hset(`session:${id}`, "sequence", sequence);
        await multi.hset(`session:${id}`, "phoneId", phoneId);
        await multi.hset(`session:${id}`, "connected", connected);
        // 设置过期时间
        multi.expire(`session:${id}`, SESSION_TTL);

        // 执行多命令事务
        multi.exec((err, replies) => {
            if (err) {
                console.error("Redis transaction error:", err);
            }
        });
    }
    async deleteSession(id) {
        return new Promise((resolve, reject) => {
            this.redisClient.del(`session:${id}`, (err, reply) => {
                if (err) {
                    console.error("Redis delete error:", err);
                    reject(err);
                } else {
                    console.log(`Session ${id} deleted successfully. Reply:`, reply);
                    resolve(reply);
                }
            });
        });
    }
    //查找出所有用户信息
    async findAllSessions() {
        const sessionKeys = await this.redisClient.keys("session:*");

        const commands = sessionKeys.map((key) => ["hmget", key, "userID", "sequence", "phoneId", "connected"]);

        const results = await this.redisClient.multi(commands).exec();

        const sessionData = results.map(([err, session]) => (err ? undefined : mapSession(session))).filter((v) => !!v);
        return sessionData;
    }
    // 设置会话的过期时间为5分钟
    async setSessionExpiration(id, {userID, sequence, phoneId}) {
        const multi = this.redisClient.multi();
        await multi.hset(`expire:${id}`, "userID", userID);
        await multi.hset(`expire:${id}`, "sequence", sequence);
        await multi.hset(`expire:${id}`, "phoneId", phoneId);

        // 使用 Redis 的 EXPIRE 命令设置过期时间
        // 设置过期时间
        multi.expire(`expire:${id}`, 900);
        // 执行多命令事务
        multi.exec((err, replies) => {
            if (err) {
                console.error("Redis transaction error:", err);
            }
        });
    }

    // 更新会话的过期时间为5分钟
    async updateSessionExpiration(id, time) {
        // 使用 Redis 的 PEXPIRE 命令更新过期时间
        return this.redisClient.expire(`expire:${id}`, time);
    }

    // 方法用于检查会话是否已经过期
    async isSessionExpired(id) {
        // 使用 Redis 的 TTL 命令获取键的剩余过期时间（秒为单位）
        const time = await this.redisClient.ttl(`expire:${id}`);
        // 使用 hmget 获取字段值
        const user = await this.redisClient.hmget(`expire:${id}`, "userID", "sequence", "phoneId");
        const userID = user[0];
        const sequence = user[1];
        const phoneId = user[2];
        return {time, userID, sequence, phoneId};
    }

    async findKeysWithPattern(pattern) {
        try {
            const keys = await this.redisClient.keys(pattern);

            // 使用 map 函数对每个键进行处理，截取后半部分
            const keyParts = keys.map((key) => {
                const parts = key.split(":"); // 根据冒号进行拆分
                return parts.slice(1).join(":"); // 获取后半部分并重新连接
            });
            return keyParts;
        } catch (error) {
            console.error("Error finding keys in Redis:", error);
            return [];
        }
    }
}
module.exports = {InMemorySessionStore, RedisSessionStore};
