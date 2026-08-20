import {
  Controller,
  Post,
  Get,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { KeycloakLoginDto } from './dto/keycloak-login.dto';
import { KeycloakService } from './keycloak.service';
import { Public } from '../../shared/decorators/public.decorator';
import { JwtAuthGuard } from '../../presentation/guards/jwt-auth.guard';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private keycloakService: KeycloakService,
  ) {}

  @Post('login')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Authenticate user' })
  @ApiResponse({ status: 200, description: 'Returns JWT tokens' })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('register')
  @Public()
  @ApiOperation({ summary: 'Register new user' })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('refresh')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token' })
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshToken(dto.refreshToken);
  }

  @Post('logout')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke a refresh token' })
  logout(@Body() dto: RefreshTokenDto) {
    return this.authService.logout(dto.refreshToken);
  }

  @Post('sso/keycloak')
  @Public()
  @ApiOperation({
    summary: 'Exchange a Keycloak access token for local JWT tokens',
  })
  @ApiResponse({
    status: 201,
    description: 'Returns JWT tokens (provisions/link the Keycloak user)',
  })
  @ApiResponse({ status: 401, description: 'Invalid Keycloak token' })
  @ApiResponse({ status: 503, description: 'Keycloak SSO not configured' })
  ssoKeycloak(@Body() dto: KeycloakLoginDto) {
    return this.keycloakService.ssoLogin(dto.accessToken);
  }

  @Get('sso/keycloak/status')
  @Public()
  @ApiOperation({
    summary: 'Report whether Keycloak SSO is enabled and its issuer',
  })
  ssoKeycloakStatus() {
    return this.keycloakService.getStatus();
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiResponse({ status: 200, description: 'Returns the authenticated user' })
  me(@Request() req: any) {
    return this.authService.getProfile(req.user.id);
  }
}
