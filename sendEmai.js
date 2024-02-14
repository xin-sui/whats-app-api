const nodemailer = require("nodemailer");
const express = require("express");
const bodyParser = require("body-parser");
const app = express();

app.use(express.json()); // 添加此行来处理 JSON 请求体
app.use(bodyParser.urlencoded({extended: true}));
// 邮件服务配置
const transporter = nodemailer.createTransport({
    host: "smtp.office365.com", // Outlook's SMTP server
    port: 587,
    secure: false,
    auth: {
        user: "xin@webbit-tech.com", // Your Outlook email
        pass: "Webbit2324" // Your Outlook password
    },
    tls: {
        ciphers: "SSLv3"
    }
});

// 发送邮件接口
function sendEmail(req, res) {
    // 获取请求参数
    const {phone, email, subject} = req.body;
    console.log(phone, email, subject);
    // // 邮件内容
    const mailOptions = {
        from: '"WEBBIT TECH" <info@webbit-tech.com>', // 发件人邮箱
        to: "xin@webbit-tech.com", // 收件人邮箱
        // to: "webbitmacau@gmail.com",
        subject: "Client", // 邮件标题
        html: `
      <h3>Phone:${phone}</h3>
      <h3>Email:${email}</h3>
   
    ` // 邮件内容
        //    <p>内容：${message}</p>
    };

    // 发送邮件
    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            console.log(error);
            res.send({code: 0, msg: "发送失败"});
        } else {
            console.log("邮件已发送：" + info.response);
            res.send({code: 1, msg: "发送成功"});
        }
    });
}
module.exports = {
    sendEmail
};
