import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class MailService {
  private readonly log = new Logger(MailService.name);
  constructor(private readonly config: ConfigService) {}
  async sendOtp(email: string, code: string) {
    if (this.config.get('MAIL_PROVIDER') === 'local') {
      if (this.config.get('NODE_ENV') === 'production')
        throw new ServiceUnavailableException('Email chưa được cấu hình.');
      this.log.log('[LOCAL EMAIL] ' + email + ' — OTP: ' + code + ' (5 phút)');
      return;
    }
    try {
      const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        signal: AbortSignal.timeout(15000),
        headers: {
          'api-key': this.config.getOrThrow<string>('BREVO_API_KEY'),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sender: {
            email: this.config.getOrThrow('MAIL_FROM_EMAIL'),
            name: this.config.get('MAIL_FROM_NAME', 'Voucher Platform'),
          },
          to: [{ email }],
          subject: 'Mã đăng nhập Voucher Platform',
          textContent: 'Mã đăng nhập của bạn: ' + code + '. Có hiệu lực trong 5 phút. Không chia sẻ mã.',
        }),
      });
      if (!response.ok) throw new Error('Email provider unavailable');
    } catch {
      throw new ServiceUnavailableException('Chưa gửi được email. Vui lòng thử lại sau.');
    }
  }
}
