import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { KeycloakService } from './keycloak.service';

describe('AuthController', () => {
  let controller: AuthController;

  const mockAuthService = {
    login: jest.fn(),
    register: jest.fn(),
    refreshToken: jest.fn(),
  };

  const mockKeycloakService = {
    getStatus: jest.fn(),
    ssoLogin: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: mockAuthService },
        { provide: KeycloakService, useValue: mockKeycloakService },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('login', () => {
    it('should return tokens on valid credentials', async () => {
      const dto = { email: 'test@test.com', password: 'password123' };
      const expected = { accessToken: 'token', refreshToken: 'refresh' };
      mockAuthService.login.mockResolvedValue(expected);

      const result = await controller.login(dto);
      expect(result).toEqual(expected);
      expect(mockAuthService.login).toHaveBeenCalledWith(dto);
    });
  });

  describe('register', () => {
    it('should create user and return tokens', async () => {
      const dto = {
        email: 'new@test.com',
        firstName: 'John',
        lastName: 'Doe',
        password: 'password123',
      };
      const expected = {
        accessToken: 'token',
        refreshToken: 'refresh',
        user: { id: '1', email: dto.email },
      };
      mockAuthService.register.mockResolvedValue(expected);

      const result = await controller.register(dto);
      expect(result).toEqual(expected);
    });
  });
});
