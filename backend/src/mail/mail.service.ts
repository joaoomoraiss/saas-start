import { Injectable } from '@nestjs/common';
import { MailerService } from 'src/mailer/mailer.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { EmailDto } from './dto/email.dto';

@Injectable()
export class MailService {
  constructor(
    private mailerService: MailerService,
    private prismaService: PrismaService,
  ) {}

  async sendUserConfirmation(email: string, token: string) {
    const url = process.env.FRONTEND_URL + '/confirm?token=' + token;
    const template = `
            <html>
                <body>
                    <h2>Welcome to URL Shortener</h2>
                    <p>Please click the link below to confirm your email:</p>
                    <a href="${url}">Confirm Email</a>
                </body>
            </html>
        `;

    await this.mailerService.sendMail(template, email);
  }

  async sendPasswordReset(email: string, token: string) {
    const url = process.env.FRONTEND_URL + '/reset-password?token=' + token;
    const template = `
            <html>
                <body>
                    <h2>Password Reset Request</h2>
                    <p>Please click the link below to reset your password:</p>
                    <a href="${url}">Reset Password</a>
                </body>
            </html>
        `;

    await this.mailerService.sendMail(template, email);
  }

  async saveEmail(emailDto: EmailDto) {
    // A validacao do formato ja acontece no ValidationPipe, via EmailDto.
    await this.prismaService.email.create({
      data: {
        address: emailDto.address,
        button: emailDto.button,
      },
    });
  }
}
