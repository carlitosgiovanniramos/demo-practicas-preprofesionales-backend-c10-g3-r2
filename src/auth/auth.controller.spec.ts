import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthController } from './auth.controller'

const auth = { login: vi.fn(), refresh: vi.fn(), logout: vi.fn() }
const response = { cookie: vi.fn(), clearCookie: vi.fn() }

describe('AuthController refresh cookie', () => {
  const controller = new AuthController(auth as never)
  beforeEach(() => vi.clearAllMocks())

  it('sets HttpOnly refresh cookies, rotates them, omits them from JSON and clears on logout', async () => {
    const expiry = new Date(Date.now() + 60_000)
    auth.login.mockResolvedValue({
      accessToken: 'access', refreshToken: 'refresh-1', refreshExpiresAt: expiry,
      user: { id: 1, email: 'student@miyura.com', role: 'STUDENT', companyId: null },
    })
    const loginResult = await controller.login({ email: 'student@miyura.com', password: '' }, response as never)
    expect(loginResult).toEqual({ accessToken: 'access', user: expect.any(Object) })
    expect(response.cookie).toHaveBeenCalledWith('yura_refresh', 'refresh-1', expect.objectContaining({ httpOnly: true, sameSite: 'strict', path: '/api/auth' }))

    auth.refresh.mockResolvedValue({ accessToken: 'access-2', refreshToken: 'refresh-2', refreshExpiresAt: expiry })
    const refreshResult = await controller.refresh({ headers: { cookie: 'theme=dark; yura_refresh=refresh-1' } } as never, response as never)
    expect(auth.refresh).toHaveBeenCalledWith('refresh-1')
    expect(refreshResult).toEqual({ accessToken: 'access-2' })
    expect(response.cookie).toHaveBeenLastCalledWith('yura_refresh', 'refresh-2', expect.any(Object))

    await controller.logout({ headers: { cookie: 'yura_refresh=refresh-2' } } as never, response as never)
    expect(auth.logout).toHaveBeenCalledWith('refresh-2')
    expect(response.clearCookie).toHaveBeenCalledWith('yura_refresh', expect.objectContaining({ path: '/api/auth' }))
  })
})
