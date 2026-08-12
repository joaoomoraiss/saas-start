import { Injectable } from '@nestjs/common';
import nodemailer, { Transporter } from 'nodemailer';

@Injectable()
export class MailerService {
  private transporter: Transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  async sendMail(template: string, to: string): Promise<void> {
    await this.transporter.sendMail({
      from: 'URL Shortener',
      to,
      html: template,
    });
  }
}
