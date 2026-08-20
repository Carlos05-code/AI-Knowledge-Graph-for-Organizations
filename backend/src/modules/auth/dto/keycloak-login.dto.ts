import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class KeycloakLoginDto {
  @ApiProperty({
    description: 'Access token issued by Keycloak for the frontend client',
  })
  @IsString()
  @IsNotEmpty()
  accessToken: string;
}
