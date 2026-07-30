import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class ImportCertificateDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(65536)
  pem!: string;
}

