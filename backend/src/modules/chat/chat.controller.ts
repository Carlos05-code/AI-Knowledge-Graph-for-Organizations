import { Controller, Post, Get, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ChatService } from './chat.service';
import { SendMessageDto } from './dto/send-message.dto';
import { CurrentUser } from '../../shared/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../presentation/guards/jwt-auth.guard';

@ApiTags('Chat')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('chat')
export class ChatController {
  constructor(private chatService: ChatService) {}

  @Post('messages')
  @ApiOperation({ summary: 'Send a message and get AI response' })
  sendMessage(@Body() dto: SendMessageDto, @CurrentUser() user: any) {
    return this.chatService.sendMessage(
      user.id,
      dto.content,
      dto.conversationId,
    );
  }

  @Get('conversations')
  @ApiOperation({ summary: 'List user conversations' })
  listConversations(@CurrentUser() user: any) {
    return this.chatService.listConversations(user.id);
  }

  @Get('conversations/:id')
  @ApiOperation({ summary: 'Get conversation history' })
  getConversation(@Param('id') id: string) {
    return this.chatService.getConversationHistory(id);
  }
}
