import { Controller, Post, Get, Body, Req, Res } from 'routing-controllers';
import { OpenAPI } from 'routing-controllers-openapi';
import type { Request, Response } from 'express';
import { AuthService } from '../../services/auth.service.js';
import { ResponseUtil } from '../../utils/response.js';
import { ErrorCodes } from '../../constants/error-codes.js';
import type { AuthenticatedRequest } from '../../types/express.js';
import { Service } from 'typedi';

export interface RegisterBody {
  email: string;
  password: string;
  username: string;
}

export interface LoginBody {
  email: string;
  password: string;
}

@Service()
@Controller('/api/v1/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * POST /api/v1/auth/register
   * Register a new user
   */
  @Post('/register')
  @OpenAPI({
    summary: 'Register a new user',
    description: 'Creates a new user account',
    responses: {
      201: { description: 'User registered successfully' },
      400: { description: 'Validation error' },
      409: { description: 'Email already exists' },
    },
  })
  async register(@Body() body: RegisterBody, @Req() _req: Request, @Res() res: Response) {
    const { email, password, username } = body;

    // Basic validation
    if (!email || !password || !username) {
      return ResponseUtil.error(
        res,
        ErrorCodes.VALIDATION_ERROR,
        'Email, password, and username are required',
        400
      );
    }

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return ResponseUtil.error(
        res,
        ErrorCodes.VALIDATION_ERROR,
        'Invalid email format',
        400
      );
    }

    // Password strength validation
    if (password.length < 8) {
      return ResponseUtil.error(
        res,
        ErrorCodes.VALIDATION_PASSWORD_TOO_WEAK,
        'Password must be at least 8 characters',
        400
      );
    }

    if (!/[A-Z]/.test(password)) {
      return ResponseUtil.error(
        res,
        ErrorCodes.VALIDATION_PASSWORD_TOO_WEAK,
        'Password must contain at least one uppercase letter',
        400
      );
    }

    if (!/[0-9]/.test(password)) {
      return ResponseUtil.error(
        res,
        ErrorCodes.VALIDATION_PASSWORD_TOO_WEAK,
        'Password must contain at least one number',
        400
      );
    }

    try {
      const user = await this.authService.register(email, password, username);
      const tokens = await this.authService.login(email, password);

      // Set access token as HTTP-only cookie
      res.cookie('accessToken', tokens.accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: tokens.expiresIn * 1000,
      });

      return ResponseUtil.created(res, {
        user,
        ...tokens,
      });
    } catch (error: any) {
      if (error.code === ErrorCodes.AUTH_EMAIL_ALREADY_EXISTS) {
        return ResponseUtil.error(res, error.code, error.message, 409);
      }
      if (error.code === ErrorCodes.AUTH_REGISTRATION_DISABLED) {
        return ResponseUtil.error(res, error.code, error.message, 403);
      }
      throw error;
    }
  }

  /**
   * POST /api/v1/auth/login
   * Login with email and password
   */
  @Post('/login')
  @OpenAPI({
    summary: 'Login user',
    description: 'Authenticates user and returns access token',
    responses: {
      200: { description: 'Login successful' },
      401: { description: 'Invalid credentials' },
    },
  })
  async login(@Body() body: LoginBody, @Req() _req: Request, @Res() res: Response) {
    const { email, password } = body;

    if (!email || !password) {
      return ResponseUtil.error(
        res,
        ErrorCodes.VALIDATION_ERROR,
        'Email and password are required',
        400
      );
    }

    try {
      const tokens = await this.authService.login(email, password);

      // Set access token as HTTP-only cookie
      res.cookie('accessToken', tokens.accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: tokens.expiresIn * 1000,
      });

      return ResponseUtil.success(res, tokens);
    } catch (error: any) {
      if (error.code === ErrorCodes.AUTH_INVALID_CREDENTIALS) {
        return ResponseUtil.error(res, error.code, error.message, 401);
      }
      throw error;
    }
  }

  /**
   * POST /api/v1/auth/logout
   * Logout current user
   */
  @Post('/logout')
  @OpenAPI({
    summary: 'Logout user',
    description: 'Logs out the current user and clears the session',
    responses: {
      204: { description: 'Logout successful' },
    },
  })
  async logout(@Req() req: AuthenticatedRequest, @Res() res: Response) {
    const userId = req.user?.id;

    if (userId) {
      await this.authService.logout(userId);
    }

    // Clear the access token cookie
    res.clearCookie('accessToken');

    return ResponseUtil.noContent(res);
  }

  /**
   * GET /api/v1/auth/me
   * Get current authenticated user
   */
  @Get('/me')
  @OpenAPI({
    summary: 'Get current user',
    description: 'Returns the authenticated user profile',
    responses: {
      200: { description: 'User profile' },
      401: { description: 'Not authenticated' },
    },
  })
  async me(@Req() req: AuthenticatedRequest, @Res() res: Response) {
    if (!req.user) {
      return ResponseUtil.error(
        res,
        ErrorCodes.AUTH_TOKEN_MISSING,
        'Not authenticated',
        401
      );
    }

    try {
      const user = await this.authService.me(req.user.id);
      return ResponseUtil.success(res, { user });
    } catch (error: any) {
      if (error.code === ErrorCodes.USER_NOT_FOUND) {
        return ResponseUtil.error(res, error.code, error.message, 404);
      }
      throw error;
    }
  }
}
