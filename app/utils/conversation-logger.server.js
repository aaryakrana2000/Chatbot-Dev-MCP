import fs from 'fs';
import path from 'path';

/**
 * Simple conversation logger - logs to root logs directory
 */
class ConversationLogger {
  constructor() {
    this.logDir = path.join(process.cwd(), 'logs');
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  getLogFilePath(conversationId) {
    const date = new Date().toISOString().split('T')[0];
    const base = conversationId ? `conversation-${conversationId}-${date}` : `chat-api-${date}`;
    return path.join(this.logDir, `${base}.log`);
  }

  /**
   * Delete all existing conversation log files (conversation-*.log).
   * Call when a new conversation starts so logs start fresh for the new conversation id.
   */
  deleteAllConversationLogs() {
    try {
      if (!fs.existsSync(this.logDir)) return;
      const files = fs.readdirSync(this.logDir);
      for (const name of files) {
        if (name.startsWith('conversation-') && name.endsWith('.log')) {
          const filePath = path.join(this.logDir, name);
          fs.unlinkSync(filePath);
        }
      }
    } catch (error) {
      try {
        const errLog = path.join(this.logDir, 'logger-errors.log');
        fs.appendFileSync(errLog, `[${new Date().toISOString()}] deleteAllConversationLogs: ${error?.message || error}\n`, 'utf8');
      } catch (_) {}
    }
  }

  /**
   * Append a single line to the log file for this conversation (or chat-api when no id).
   * When conversationId is present and this conversation's log file does not exist yet
   * (new conversation), deletes all previous conversation log files first so the new
   * conversation starts with a fresh log file.
   * @param {string|null} conversationId - Conversation ID, or null for non-conversation requests
   * @param {string} message - Log message
   * @param {object} [data] - Optional object to serialize
   * @param {{ file?: string, function?: string }} [source] - Source file and function name for the log line
   */
  appendMessage(conversationId, message, data = {}, source = {}) {
    try {
      const logFile = this.getLogFilePath(conversationId);
      if (conversationId && !fs.existsSync(logFile)) {
        this.deleteAllConversationLogs();
      }
      const timestamp = new Date().toISOString();
      const file = source.file ? `[${source.file}]` : '';
      const fn = source.function ? `[${source.function}]` : '';
      const dataStr = Object.keys(data).length ? ' ' + JSON.stringify(data) : '';
      const parts = [`[${timestamp}]`, file, fn, message].filter(Boolean);
      const line = parts.join(' ') + dataStr + '\n';
      fs.appendFileSync(logFile, line, 'utf8');
    } catch (error) {
      try {
        const errLog = path.join(this.logDir, 'logger-errors.log');
        fs.appendFileSync(errLog, `[${new Date().toISOString()}] appendMessage: ${error?.message || error}\n`, 'utf8');
      } catch (_) {}
    }
  }

  writeLog(conversationId, type, data) {
    try {
      const logFile = this.getLogFilePath(conversationId);
      const logEntry = JSON.stringify({
        timestamp: new Date().toISOString(),
        type,
        ...data
      }) + '\n';
      fs.appendFileSync(logFile, logEntry, 'utf8');
    } catch (error) {
      try {
        const errLog = path.join(this.logDir, 'logger-errors.log');
        fs.appendFileSync(errLog, `[${new Date().toISOString()}] writeLog: ${error?.message || error}\n`, 'utf8');
      } catch (_) {}
    }
  }

  logLLMRequest(conversationId, provider, request) {
    this.writeLog(conversationId, 'LLM_REQUEST', {
      provider,
      model: request.model,
      messages: request.messages?.length || 0,
      tools: request.tools?.length || 0
    });
  }

  logLLMResponse(conversationId, provider, response) {
    this.writeLog(conversationId, 'LLM_RESPONSE', {
      provider,
      stopReason: response.stop_reason,
      toolCalls: response.tool_calls?.length || 0,
      toolNames: response.tool_calls?.map(t => t.name) || []
    });
  }

  logToolExecution(conversationId, toolName, success = true, error = null) {
    this.writeLog(conversationId, 'TOOL_EXECUTION', {
      toolName,
      success,
      error: error?.message || null
    });
  }
}

let conversationLoggerInstance = null;

export function getConversationLogger() {
  if (!conversationLoggerInstance) {
    conversationLoggerInstance = new ConversationLogger();
  }
  return conversationLoggerInstance;
}

export default getConversationLogger();