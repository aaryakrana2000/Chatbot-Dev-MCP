// Voice recognition functionality
const VoiceHandler = {
  recognition: null,
  isListening: false,
  isSupported: false,

  init() {
    // Enhanced browser support detection
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
      console.warn('Speech recognition not supported in this browser');
      this.isSupported = false;
      return;
    }

    this.isSupported = true;
    this.recognition = new SpeechRecognition();
    
    // Configure recognition settings
    this.recognition.continuous = false;
    this.recognition.interimResults = true;  
    this.recognition.lang = 'en-IN';   
    this.recognition.maxAlternatives = 1;

    // Set up event handlers
    this.setupRecognitionHandlers();
  },

  setupRecognitionHandlers() {
    if (!this.recognition) return;

    this.recognition.onstart = () => {
      console.log('Speech recognition started');
      this.isListening = true;
      this.updateUI(true);
      this.showError('Listening... Speak your message');
    };

    this.recognition.onend = () => {
      console.log('Speech recognition ended');
      this.isListening = false;
      this.updateUI(false);
    };

    this.recognition.onresult = (event) => {
      // Process all results (both interim and final)
      let interimTranscript = '';
      let finalTranscript = '';
      
      // Loop through all results
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }
      
      // Log the current speech in real-time
      const currentSpeech = finalTranscript + interimTranscript;
      console.log('Current speech:', currentSpeech);
      
      // Show interim results in real-time
    //   if (interimTranscript) {
    //     this.showError('Listening: ' + interimTranscript);
    //   }
      
      // If we have final results, process them
      if (finalTranscript) {
        console.log('Final transcript:', finalTranscript);
        // this.showError('Heard: ' + finalTranscript);
        
        const inputField = document.querySelector('.shop-ai-chat-input input');
        if (inputField) {
          // Set the input field value
          inputField.value = finalTranscript.trim();
          
          // Focus the input field and trigger input event
          inputField.focus();
          inputField.dispatchEvent(new Event('input', { bubbles: true }));
          
          // Small delay before sending to let user see what was transcribed
          setTimeout(() => {
            const sendButton = document.querySelector('.shop-ai-chat-send');
            if (sendButton && inputField.value.trim()) {
              sendButton.click();
            }
          }, 800);
        }
        
        this.stopListening();
      }
    };

    this.recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      this.isListening = false;
      this.updateUI(false);

      let message = '';
      switch (event.error) {
        case 'not-allowed':
          message = 'Please allow microphone access in your browser settings.';
          break;
        case 'no-speech':
          message = 'No speech was detected. Please try again.';
          break;
        case 'audio-capture':
          message = 'No microphone was found. Ensure it\'s properly connected.';
          break;
        case 'network':
          message = 'Network error occurred. Please check your connection.';
          break;
        default:
          message = 'Error occurred during voice recognition. Please try again.';
      }

      // Show error message in chat
      const messageElement = document.createElement('div');
      messageElement.classList.add('shop-ai-message', 'system');
      messageElement.textContent = message;
      const messagesContainer = document.querySelector('.shop-ai-chat-messages');
      if (messagesContainer) {
        messagesContainer.appendChild(messageElement);
        // Remove message after 5 seconds
        setTimeout(() => messageElement.remove(), 6000);
      }
    };
  },

  async checkPermission() {
    try {
      // Check if we're in an iframe
      const isIframe = window !== window.top;
      console.log('Environment check:', {
        userAgent: navigator.userAgent,
        permissions: !!navigator.permissions,
        mediaDevices: !!navigator.mediaDevices,
        isIframe,
        isSecureContext: window.isSecureContext,
        host: window.location.host
      });

      // If in iframe, we need special handling
      if (isIframe) {
        console.log('Running in iframe - attempting to handle Shopify iframe case');
        // Get the parent URL
        const parentURL = new URL(window.location.ancestorOrigins[0] || document.referrer);
        console.log('Parent URL:', parentURL.href);
        
        this.showError(
          'Voice input requires additional permissions. Please:\n' +
          '1. Click the lock icon (🔒) in the address bar\n' +
          '2. Click "Site settings"\n' +
          '3. Find "Microphone" and change to "Allow"\n' +
          '4. Reload this page\n\n' +
          'If issues persist, please open the shop in a new tab.'
        );
      }

      // Check if microphone access is blocked by policy
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        console.error('MediaDevices API not available');
        this.showError('Your browser does not support microphone access');
        return false;
      }

      // First check if we're in a secure context
      if (!window.isSecureContext) {
        console.error('Not in secure context');
        this.showError('Voice input requires a secure (HTTPS) connection');
        return false;
      }

      // Check permission status before requesting access
      if (navigator.permissions && navigator.permissions.query) {
        try {
          const permResult = await navigator.permissions.query({ name: 'microphone' });
          console.log('Current permission state:', permResult.state);

          // Special handling for denied state
          if (permResult.state === 'denied') {
            // Check if we're in a Shopify iframe
            if (window.location.host.includes('myshopify.com') && isIframe) {
              this.showError(
                'Microphone access is blocked in the embedded shop view. Please:\n' +
                '1. Open the shop in a new tab, or\n' +
                '2. Allow microphone access in site settings:\n' +
                '   - Click the lock icon (🔒)\n' +
                '   - Select "Site settings"\n' +
                '   - Find "Microphone"\n' +
                '   - Change to "Allow"'
              );
            } else {
              this.showError('Microphone access is blocked. To fix this:\n' +
                '1. Click the lock icon (🔒) in the address bar\n' +
                '2. Click "Site settings"\n' +
                '3. Find "Microphone" and select "Allow"\n' +
                '4. Reload the page\n' +
                '5. Try again when prompted');
            }
            return false;
          }
        } catch (e) {
          console.warn('Permission query failed:', e);
        }
      }

      // Try to get microphone access
      try {
        console.log('Requesting microphone access...');
        const constraints = { 
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            sampleRate: 48000
          },
          video: false
        };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        console.log('Microphone access granted');
        stream.getTracks().forEach(track => track.stop());
        return true;
      } catch (error) {
        console.error('Initial microphone access error:', {
          name: error.name,
          message: error.message,
          constraint: error.constraint
        });
        
        // If it's a permissions policy error, show special instructions
        if (error.name === 'NotAllowedError' && error.message.includes('Permissions-Policy')) {
          this.showError('Microphone access is currently restricted. Please try:\n' +
            '1. Open a new tab directly to our website\n' +
            '2. Make sure you\'re not in incognito/private mode\n' +
            '3. Try a different browser if the issue persists');
          return false;
        }

        // For other permission issues, check detailed status
        try {
          if (navigator.permissions && navigator.permissions.query) {
            const result = await navigator.permissions.query({ name: 'microphone' });
            console.log('Current permission state:', result.state);
            
            if (result.state === 'prompt') {
              this.showError('When prompted, click "Allow" to enable voice input');
              return false;
            } else if (result.state === 'denied') {
              const steps = [
                "1. Click the lock icon (🔒) in the address bar",
                "2. Click 'Reset permissions'",
                "3. Reload this page",
                "4. Try the voice button again"
              ];
              this.showError(`Please enable microphone access:\n${steps.join('\n')}`);
              return false;
            }
          }
        } catch (e) {
          console.warn('Permission query failed:', e);
        }
      }

      // Always try to get actual microphone access
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          audio: true,
          video: false 
        });
        // Successfully got access, stop the test stream
        stream.getTracks().forEach(track => track.stop());
        return true;
      } catch (error) {
        console.error('Microphone access error:', error);
        
        if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
          this.showError('Please click "Allow" when prompted for microphone access.');
        } else if (error.name === 'NotFoundError') {
          this.showError('No microphone found. Please connect a microphone and try again.');
        } else if (error.name === 'NotReadableError') {
          this.showError('Your microphone might be in use by another application.');
        } else {
          this.showError('Could not access microphone. Please check your device settings.');
        }
        return false;
      }
    } catch (error) {
      console.error('Permission check failed:', error);
      this.showError('Could not verify microphone access. Please try again.');
      return false;
    }
  },

  getBrowserName() {
    if (navigator.userAgent.indexOf("Chrome") !== -1) return "Chrome";
    if (navigator.userAgent.indexOf("Firefox") !== -1) return "Firefox";
    if (navigator.userAgent.indexOf("Safari") !== -1) return "Safari";
    if (navigator.userAgent.indexOf("Edge") !== -1) return "Edge";
    return "browser";
  },

  showError(message) {
    const messageElement = document.createElement('div');
    messageElement.classList.add('shop-ai-message', 'system');
    messageElement.textContent = message;
    const messagesContainer = document.querySelector('.shop-ai-chat-messages');
    if (messagesContainer) {
      messagesContainer.appendChild(messageElement);
      // Keep error messages visible longer for permanent denials
      const timeout = message.includes('permanently blocked') ? 10000 : 5000;
      setTimeout(() => messageElement.remove(), timeout);
    }
  },

  async startListening() {
    if (!this.isSupported) {
      this.showError('Voice recognition is not supported in your browser');
      return;
    }

    if (this.isListening) {
      this.stopListening();
      return;
    }

    try {
      // First verify microphone access
      const hasPermission = await this.checkPermission();
      if (!hasPermission) return;

      // Then try to start recognition
      await new Promise((resolve, reject) => {
        try {
          this.recognition.onerror = (event) => reject(new Error(event.error));
          this.recognition.onstart = () => resolve();
          this.recognition.start();
          
          // Set a timeout in case the start event never fires
          setTimeout(() => reject(new Error('start-timeout')), 2000);
        } catch (e) {
          reject(e);
        }
      });

      this.isListening = true;
      this.updateUI(true);
      
    } catch (error) {
      console.error('Failed to start voice recognition:', error);
      this.isListening = false;
      this.updateUI(false);
      
      if (error.message === 'start-timeout') {
        this.showError('Failed to start voice recognition. Please try again.');
      } else if (error.message === 'not-allowed') {
        // Handle this case specifically since it might occur after permission was initially granted
        this.showError('Microphone access was denied. Please check your browser settings and try again.');
      }
    }
  },

  stopListening() {
    if (!this.isSupported || !this.isListening) return;

    try {
      this.recognition.stop();
    } catch (error) {
      console.error('Failed to stop voice recognition:', error);
    }
    this.isListening = false;
    this.updateUI(false);
  },

  updateUI(isListening) {
    const voiceButton = document.querySelector('.shop-ai-chat-voice');
    if (!voiceButton) return;

    if (isListening) {
      voiceButton.classList.add('listening');
    } else {
      voiceButton.classList.remove('listening');
    }
  }
};

window.VoiceHandler = VoiceHandler;
