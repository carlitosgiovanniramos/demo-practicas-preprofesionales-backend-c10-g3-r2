import { HttpException, HttpStatus } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'
import { HttpExceptionFilter } from './http-exception.filter'

describe('HttpExceptionFilter', () => {
  it('shapes the response as { statusCode, message, path, timestamp }', () => {
    const json = vi.fn()
    const status = vi.fn().mockReturnValue({ json })
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status }),
        getRequest: () => ({ url: '/api/offers' }),
      }),
    } as never

    new HttpExceptionFilter().catch(new HttpException('no encontrado', HttpStatus.NOT_FOUND), host)

    expect(status).toHaveBeenCalledWith(404)
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 404, message: 'no encontrado', path: '/api/offers' }),
    )
  })
})
