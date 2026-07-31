import {
  IsBase64,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";

export class ImportCertificateDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @IsString()
  @IsOptional()
  @MaxLength(65536)
  pem?: string;

  @IsBase64()
  @IsOptional()
  @MaxLength(65536)
  contentBase64?: string;
}
