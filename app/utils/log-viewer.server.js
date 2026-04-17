import fs from 'fs';
import path from 'path';

/**
 * Log viewer utility for conversation logs
 */
class LogViewer {
  constructor() {
    this.logDir = path.join(process.cwd(), 'logs');
  }

  /**
   * Get all conversation log files
   */
  getConversationLogFiles() {
    try {
      if (!fs.existsSync(this.logDir)) {
        return [];
      }
      
      const files = fs.readdirSync(this.logDir);
      return files
        .filter(file => file.startsWith('conversation-') && file.endsWith('.log'))
        .map(file => ({
          filename: file,
          conversationId: file.replace('conversation-', '').replace('.log', ''),
          path: path.join(this.logDir, file),
          stats: fs.statSync(path.join(this.logDir, file))
        }))
        .sort((a, b) => b.stats.mtime - a.stats.mtime); // Sort by modification time, newest first
    } catch (error) {
      console.error('Error reading log directory:', error);
      return [];
    }
  }

  /**
   * Read conversation log
   */
  readConversationLog(conversationId) {
    try {
      const logFile = path.join(this.logDir, `conversation-${conversationId}.log`);
      
      if (!fs.existsSync(logFile)) {
        return null;
      }

      const content = fs.readFileSync(logFile, 'utf8');
      const lines = content.split('\n').filter(line => line.trim());
      
      return lines.map(line => {
        try {
          // Parse timestamp and level from log format: [timestamp] [level] message
          const match = line.match(/^\[([^\]]+)\] \[([^\]]+)\] (.+)$/);
          if (match) {
            const [, timestamp, level, message] = match;
            let parsedMessage;
            
            try {
              parsedMessage = JSON.parse(message);
            } catch {
              parsedMessage = { message };
            }
            
            return {
              timestamp,
              level,
              ...parsedMessage
            };
          }
          return { raw: line };
        } catch (error) {
          return { raw: line, parseError: error.message };
        }
      });
    } catch (error) {
      console.error('Error reading conversation log:', error);
      return null;
    }
  }

  /**
   * Get conversation summary
   */
  getConversationSummary(conversationId) {
    const logs = this.readConversationLog(conversationId);
    if (!logs) return null;

    const summary = {
      conversationId,
      messageCount: 0,
      userMessages: 0,
      assistantMessages: 0,
      toolCalls: 0,
      errors: 0,
      startTime: null,
      endTime: null,
      duration: null
    };

    logs.forEach(log => {
      if (log.type === 'user_message') summary.userMessages++;
      if (log.type === 'assistant_message') summary.assistantMessages++;
      if (log.type === 'tool_call') summary.toolCalls++;
      if (log.level === 'ERROR') summary.errors++;
      if (log.type === 'conversation_start') summary.startTime = log.timestamp;
      if (log.type === 'conversation_end') summary.endTime = log.timestamp;
    });

    summary.messageCount = summary.userMessages + summary.assistantMessages;

    if (summary.startTime && summary.endTime) {
      const start = new Date(summary.startTime);
      const end = new Date(summary.endTime);
      summary.duration = Math.round((end - start) / 1000); // Duration in seconds
    }

    return summary;
  }

  /**
   * List all conversations with summaries
   */
  listConversations() {
    const logFiles = this.getConversationLogFiles();
    return logFiles.map(file => ({
      ...file,
      summary: this.getConversationSummary(file.conversationId)
    }));
  }
}

export default LogViewer;