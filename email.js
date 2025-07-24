const express = require("express");
const nodemailer = require("nodemailer");
const router = express.Router();

// Load environment variables
require('dotenv').config();

// Configure transporter
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,   // Your Gmail address
    pass: process.env.EMAIL_PASS,   // Gmail app password
  },
});

router.post("/send-borrower-mail", async (req, res) => {
  const { name, email, principal, interestRate, tenure, emi, lenderName } = req.body;

  try {
    const mailOptions = {
      from: `"Loan Service" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "Your Loan Details",
      html: `
        <h2>Hello ${name},</h2>
        <p>You lended money from <strong>${lenderName}</strong>. Here are your loan details:</p>
        <ul>
          <li><strong>Principal:</strong> ₹${principal}</li>
          <li><strong>Interest Rate:</strong> ${interestRate}%</li>
          <li><strong>Tenure:</strong> ${tenure} months</li>
          <li><strong>EMI:</strong> ₹${emi}</li>
        </ul>
        <p>Thank you for choosing our lending service!</p>
      `,
    };

    await transporter.sendMail(mailOptions);
    res.json({ success: true, message: "Email sent successfully" });
  } catch (error) {
    console.error("Error sending mail:", error);
    res.status(500).json({ success: false, message: "Failed to send email" });
  }
});

module.exports = router;
