import { Body, Controller, Post, Req, Res } from '@nestjs/common'
import { AuthService } from './auth.service'
import { LoginDto } from './dto/login.dto'

const REFRESH_COOKIE = 'yura_refresh'
const REFRESH_COOKIE_PATH = '/api/auth'

interface CookieRequest {
  headers: { cookie?: string }
}

interface RefreshCookieOptions {
  httpOnly: boolean
  secure: boolean
  sameSite: 'strict'
  path: string
  maxAge?: number
}

interface CookieResponse {
  cookie(name: string, value: string, options: RefreshCookieOptions): void
  clearCookie(name: string, options: RefreshCookieOptions): void
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) response: CookieResponse) {
    const { refreshToken, refreshExpiresAt, ...result } = await this.auth.login(dto.email, dto.password)
    this.setRefreshCookie(response, refreshToken, refreshExpiresAt)
    return result
  }

  @Post('refresh')
  async refresh(@Req() request: CookieRequest, @Res({ passthrough: true }) response: CookieResponse) {
    const result = await this.auth.refresh(this.readRefreshCookie(request))
    const { refreshToken, refreshExpiresAt, ...publicResult } = result
    this.setRefreshCookie(response, refreshToken, refreshExpiresAt)
    return publicResult
  }

  @Post('logout')
  async logout(@Req() request: CookieRequest, @Res({ passthrough: true }) response: CookieResponse) {
    await this.auth.logout(this.readRefreshCookie(request))
    response.clearCookie(REFRESH_COOKIE, this.cookieOptions())
    return { ok: true }
  }

  private readRefreshCookie(request: CookieRequest): string | undefined {
    const cookies = request.headers.cookie?.split(';') ?? []
    const pair = cookies.map((cookie) => cookie.trim()).find((cookie) => cookie.startsWith(`${REFRESH_COOKIE}=`))
    return pair?.slice(REFRESH_COOKIE.length + 1)
  }

  private setRefreshCookie(response: CookieResponse, token: string, expiresAt: Date): void {
    response.cookie(REFRESH_COOKIE, token, {
      ...this.cookieOptions(),
      maxAge: Math.max(0, expiresAt.getTime() - Date.now()),
    })
  }

  private cookieOptions(): RefreshCookieOptions {
    return {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict' as const,
      path: REFRESH_COOKIE_PATH,
    }
  }
}
