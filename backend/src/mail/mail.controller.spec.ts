import { Test } from '@nestjs/testing';
import { mock, MockProxy } from 'jest-mock-extended';
import { Buttons } from 'generated/prisma/enums';
import { MailController } from './mail.controller';
import { MailService } from './mail.service';

describe('MailController', () => {
  let controller: MailController;
  let mailService: MockProxy<MailService>;

  beforeEach(async () => {
    mailService = mock<MailService>();

    const moduleRef = await Test.createTestingModule({
      controllers: [MailController],
      providers: [{ provide: MailService, useValue: mailService }],
    }).compile();

    controller = moduleRef.get(MailController);
  });

  it('repassa o DTO ao service', async () => {
    const dto = { address: 'a@b.com', button: Buttons.BUY };

    await controller.saveEmail(dto);

    expect(mailService.saveEmail).toHaveBeenCalledWith(dto);
  });

  it('nao devolve corpo na resposta', async () => {
    await expect(
      controller.saveEmail({ address: 'a@b.com', button: Buttons.COMMON }),
    ).resolves.toBeUndefined();
  });
});
