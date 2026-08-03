import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { ConnectorType } from '../../../domain/entities/connector.entity';

export class CreateConnectorDto {
  @ApiProperty({ description: 'Human-readable connector name' })
  @IsString()
  name: string;

  @ApiProperty({ enum: ConnectorType })
  @IsEnum(ConnectorType)
  type: ConnectorType;

  @ApiProperty({
    description:
      'JSON string with the connector secrets, e.g. {"token":"xoxb-..."}',
  })
  @IsString()
  credentials: string;

  @ApiPropertyOptional({
    description: 'Runtime configuration (channels, repositories, limits)',
  })
  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;

  @ApiPropertyOptional({
    description: 'Auto-sync interval in minutes (min 5)',
  })
  @IsOptional()
  @IsInt()
  @Min(5)
  syncInterval?: number;
}
