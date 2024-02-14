const {OpenAI} = require("openai");
const openai = new OpenAI({
    apiKey: "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" // defaults to process.env["OPENAI_API_KEY"]
});
async function sendChatGpt(content) {
    try {
        const stream = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [{role: "user", content: content}],
            stream: true
        });

        return stream;
    } catch (error) {
        console.log(error);
        return error;
    }
}
module.exports = {
    sendChatGpt
};
