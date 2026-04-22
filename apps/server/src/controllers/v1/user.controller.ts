import { Controller, Get, Req, Res } from 'routing-controllers';
import { OpenAPI } from 'routing-controllers-openapi';
import type { Response } from 'express';
import { UserService } from '../../services/user.service.js';
import { ResponseUtil } from '../../utils/response.js';
import { ErrorCodes } from '../../constants/error-codes.js';
import type { AuthenticatedRequest } from '../../types/express.js';
import { Service } from 'typedi';

@Service()
@Controller('/api/v1/user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  /**
   * GET /api/v1/user/profile
   * Get current user's profile
   */
  @Get('/profile')
  @OpenAPI({
    summary: 'Get user profile',
    description: 'Returns the profile of the authenticated user',
    responses: {
      200: { description: 'User profile' },
      401: { description: 'Not authenticated' },
      404: { description: 'User not found' },
    },
  })
  async getProfile(@Req() req: AuthenticatedRequest, @Res() res: Response) {
    if (!req.user) {
      return ResponseUtil.error(
        res,
        ErrorCodes.AUTH_TOKEN_MISSING,
        'Not authenticated',
        401
      );
    }

    try {
      const profile = await this.userService.getProfile(req.user.id);
      return ResponseUtil.success(res, { profile });
    } catch (error: any) {
      if (error.code === ErrorCodes.USER_NOT_FOUND) {
        return ResponseUtil.error(res, error.code, error.message, 404);
      }
      throw error;
    }
  }
}
