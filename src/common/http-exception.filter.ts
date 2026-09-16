import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException } from '@nestjs/common'

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost): void {
    const ctx = host.switchToHttp()
    const response = ctx.getResponse()
    const request = ctx.getRequest()
    const status = exception.getStatus()
    const payload = exception.getResponse()

    response.status(status).json({
      statusCode: status,
      message: typeof payload === 'string' ? payload : (payload as { message?: unknown }).message,
      path: request.url,
      timestamp: new Date().toISOString(),
    })
  }
}
