const redis = require("redis");
const client = redis.createClient();

module.exports = new (class Redis {
    async setNX(key, id, expire) {
        //set('hello', 'world', , 300, function(err, reply) {...});

        return new Promise((resolve, reject) => {
            client.set(key, id, "NX", "EX", expire, (err, reply) => {
                if (err) {
                    reject();
                } else {
                    resolve(reply);
                }
            });
        });
    }

    //expire 秒
    set(key, obj, expire = 86400) {
        if (typeof obj == "object") {
            obj = JSON.stringify(obj);
        }

        return new Promise((resolve, reject) => {
            client.set(key, obj, (err, reply) => {
                if (err) {
                    console.warn(err);
                    reject();
                } else {
                    resolve(obj);
                }
            });

            //默认放一天
            client.expire(key, expire);
        });
    }

    get(key) {
        if (!key) {
            console.warn("Redis key is undefined!");
            return;
        }
        return new Promise((resolve, reject) => {
            client.get(key, (err, reply) => {
                if (err) {
                    console.warn(err);
                    reject();
                } else {
                    resolve(reply);
                }
            });
        });
    }

    del(key) {
        return new Promise((resolve, reject) => {
            client.del(key, (err, reply) => {
                if (err) {
                    console.warn(err);
                    reject();
                } else {
                    resolve(reply);
                }
            });
        });
    }
})();
