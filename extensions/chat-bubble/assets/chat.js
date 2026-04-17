/**
 * Shop AI Chat - Client-side implementation
 *
 * This module handles the chat interface for the Shopify AI Chat application.
 * It manages the UI interactions, API communication, and message rendering.
 */
(function() {
  'use strict';

  /**
   * Application namespace to prevent global scope pollution
   */
  const ShopAIChat = {
    /**
     * UI-related elements and functionality
     */
    UI: {
      elements: {},
      isMobile: false,

      /**
       * Initialize UI elements and event listeners
       * @param {HTMLElement} container - The main container element
       */
      init: function(container) {
        if (!container) return;

        // Cache DOM elements
        this.elements = {
          container: container,
          chatBubble: container.querySelector('.shop-ai-chat-bubble'),
          chatWindow: container.querySelector('.shop-ai-chat-window'),
          closeButton: container.querySelector('.shop-ai-chat-close'),
          minimizeButton: container.querySelector('.shop-ai-chat-minimize'),
          chatInput: container.querySelector('.shop-ai-chat-input input'),
          sendButton: container.querySelector('.shop-ai-chat-send'),
          voiceButton: container.querySelector('.shop-ai-chat-voice'),
          uploadButton: container.querySelector('.shop-ai-chat-upload'),
          fileInput: container.querySelector('#shop-ai-image-upload'),
          imagePreviewContainer: container.querySelector('#shop-ai-image-preview-container'),
          imagePreview: container.querySelector('#shop-ai-image-preview'),
          imagePreviewRemove: container.querySelector('#shop-ai-image-preview-remove'),
          messagesContainer: container.querySelector('.shop-ai-chat-messages')
        };

        // Detect mobile device
        this.isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

        // Set up event listeners
        this.setupEventListeners();

        // Fix for iOS Safari viewport height issues
        if (this.isMobile) {
          this.setupMobileViewport();
        }
      },

      /**
       * Set up all event listeners for UI interactions
       */
      setupEventListeners: function() {
        const { chatBubble, closeButton, minimizeButton, chatInput, sendButton, voiceButton, uploadButton, fileInput, messagesContainer } = this.elements;

        // Toggle chat window visibility
        chatBubble.addEventListener('click', () => this.toggleChatWindow());

        // Close chat window
        closeButton.addEventListener('click', () => this.showCloseConfirmation());

        // Minimize chat window
        minimizeButton.addEventListener('click', () => this.minimizeChatWindow());

        // Send message when pressing Enter in input
        chatInput.addEventListener('keypress', (e) => {
          if (e.key === 'Enter') {
            const hasText = chatInput.value.trim() !== '';
            const hasImage = ShopAIChat.ImageUpload.getUploadedImage() !== null;
            
            if (hasText || hasImage) {
              ShopAIChat.Message.send(chatInput, messagesContainer);

              // On mobile, handle keyboard
              if (this.isMobile) {
                chatInput.blur();
                setTimeout(() => chatInput.focus(), 300);
              }
            }
          }
        });

        // Send message when clicking send button
        sendButton.addEventListener('click', () => {
          const hasText = chatInput.value.trim() !== '';
          const hasImage = ShopAIChat.ImageUpload.getUploadedImage() !== null;
          
          if (hasText || hasImage) {
            ShopAIChat.Message.send(chatInput, messagesContainer);

            // On mobile, focus input after sending
            if (this.isMobile) {
              setTimeout(() => chatInput.focus(), 300);
            }
          }
        });

        // Voice button click handler
        if (voiceButton) {
          voiceButton.addEventListener('click', () => {
            if (window.VoiceHandler) {
              if (window.VoiceHandler.isListening) {
                window.VoiceHandler.stopListening();
              } else {
                window.VoiceHandler.startListening();
              }
            }
          });
        }

        // Image upload button click handler
        if (uploadButton && fileInput) {
          uploadButton.addEventListener('click', () => {
            fileInput.click();
          });

          // Handle file selection
          fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
              ShopAIChat.ImageUpload.handleImageUpload(file);
              // Reset the input so the same file can be selected again
              fileInput.value = '';
            }
          });
        }

        // Image preview remove button handler
        if (this.elements.imagePreviewRemove) {
          this.elements.imagePreviewRemove.addEventListener('click', () => {
            ShopAIChat.ImageUpload.clearImagePreview();
          });
        }

        // Handle window resize to adjust scrolling
        window.addEventListener('resize', () => this.scrollToBottom());

        // Add global click handler for auth links
        document.addEventListener('click', function(event) {
          if (event.target && event.target.classList.contains('shop-auth-trigger')) {
            event.preventDefault();
            if (window.shopAuthUrl) {
              ShopAIChat.Auth.openAuthPopup(window.shopAuthUrl);
            }
          }
        });

        // Setup close confirmation modal
        this.setupCloseConfirmationModal();
      },

      /**
       * Setup mobile-specific viewport adjustments
       */
      setupMobileViewport: function() {
        const setViewportHeight = () => {
          document.documentElement.style.setProperty('--viewport-height', `${window.innerHeight}px`);
        };
        window.addEventListener('resize', setViewportHeight);
        setViewportHeight();
      },

      /**
       * Toggle chat window visibility
       */
      toggleChatWindow: function() {
        const { container, chatWindow, chatInput, messagesContainer } = this.elements;

        chatWindow.classList.toggle('active');

        if (chatWindow.classList.contains('active')) {
          container.classList.add('chat-open');
          
          // On mobile, prevent body scrolling and delay focus
          if (this.isMobile) {
            document.body.classList.add('shop-ai-chat-open');
            setTimeout(() => chatInput.focus(), 500);
          } else {
            chatInput.focus();
          }

          // Create cart via Storefront API when chatbot opens
          // console.log('Creating cart via Storefront API...');
          
          const createCart = async () => {
            try {
              const response = await fetch('/cart', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({})
              });
              
              if (response.ok) {
                const cartData = await response.json();
                // console.log('Created cart via Storefront API:', cartData);
                return cartData.token;
              }
              
              console.log('Failed to create cart via API');
              return null;
            } catch (error) {
              console.error('Error creating cart:', error);
              return null;
            }
          };
          
          // Create and store cart ID
          createCart().then(cartId => {
            if (cartId) {
              // console.log('Storing created cart ID:', cartId);
              sessionStorage.setItem('shopAiCartId', cartId);
            }
          });
          
          // Add page-specific question when chat opens
          this.addPageSpecificQuestion(messagesContainer);
          
          // Always scroll messages to bottom when opening
          this.scrollToBottom();
        } else {
          container.classList.remove('chat-open');
          // Remove body class when closing
          document.body.classList.remove('shop-ai-chat-open');
        }
      },

      /**
       * Setup close confirmation modal event listeners
       */
      setupCloseConfirmationModal: function() {
        const modal = document.getElementById('shop-ai-close-confirmation-modal');
        const yesButton = document.getElementById('shop-ai-close-modal-yes');
        const noButton = document.getElementById('shop-ai-close-modal-no');
        const overlay = modal.querySelector('.shop-ai-close-modal-overlay');

        yesButton.addEventListener('click', () => {
          this.confirmClose();
        });

        noButton.addEventListener('click', () => {
          this.hideCloseConfirmation();
        });
      },

      /**
       * Show close confirmation modal
       */
      showCloseConfirmation: function() {
        const modal = document.getElementById('shop-ai-close-confirmation-modal');
        modal.classList.add('active');
      },

      /**
       * Hide close confirmation modal
       */
      hideCloseConfirmation: function() {
        const modal = document.getElementById('shop-ai-close-confirmation-modal');
        modal.classList.remove('active');
      },

      /**
       * Confirm close and clear storage
       */
      confirmClose: function() {
        // Clear all chat-related storage
        sessionStorage.removeItem('shopAiConversationId');
        sessionStorage.removeItem('shopAiCartId');
        sessionStorage.removeItem('shopAiCurrentProduct');
        sessionStorage.removeItem('shopAiMessageSendTime');
        sessionStorage.removeItem('shopAiLlmStartTime');
        sessionStorage.removeItem('shopAiToolTimes');
        
        // Clear localStorage chat data
        localStorage.removeItem('shopAiChatMessages');
        localStorage.removeItem('shopAiChatProducts');
        localStorage.removeItem('shopAiGeneratedImage');
        
        // Clear page-specific questions shown flags
        Object.keys(sessionStorage).forEach(key => {
          if (key.startsWith('shopAiPageSpecificShown_')) {
            sessionStorage.removeItem(key);
          }
        });
        
        // Clear chat messages from DOM
        const { messagesContainer } = this.elements;
        if (messagesContainer) {
          messagesContainer.innerHTML = '';
          
          // Show welcome message and suggestive questions after clearing
          setTimeout(() => {
            const welcomeMessage = window.shopChatConfig?.welcomeMessage || "👋 Hi there! How can I help you today?";
            ShopAIChat.Message.add(welcomeMessage, 'assistant', messagesContainer);
            
            // Get questions from config
            const configQuestions = window.shopChatConfig?.suggestiveQuestions || [];
            const maxQuestions = window.shopChatConfig?.maxSuggestiveQuestions || 4;
            
            if (configQuestions && configQuestions.length > 0) {
              const questionsToShow = configQuestions.slice(0, maxQuestions);
              ShopAIChat.UI.displaySuggestiveQuestions(questionsToShow, messagesContainer);
            }
          }, 100);
        }
        
        this.hideCloseConfirmation();
        this.closeChatWindow();
      },

      /**
       * Close chat window
       */
      closeChatWindow: function() {
        const { container, chatWindow, chatInput } = this.elements;

        chatWindow.classList.remove('active');
        container.classList.remove('chat-open');

        // On mobile, blur input to hide keyboard and enable body scrolling
        if (this.isMobile) {
          chatInput.blur();
          document.body.classList.remove('shop-ai-chat-open');
        }
      },

      /**
       * Minimize chat window
       */
      minimizeChatWindow: function() {
        const { container, chatWindow, chatInput } = this.elements;

        chatWindow.classList.remove('active');
        container.classList.remove('chat-open');

        // On mobile, blur input to hide keyboard and enable body scrolling
        if (this.isMobile) {
          chatInput.blur();
          document.body.classList.remove('shop-ai-chat-open');
        }
      },

      /**
       * Scroll messages container to bottom
       */
      scrollToBottom: function() {
        const { messagesContainer } = this.elements;
        if (!messagesContainer) return;
        setTimeout(() => {
          messagesContainer.scrollTo({
            top: messagesContainer.scrollHeight,
            behavior: 'smooth'
          });
        }, 50);
      },

      /**
       * Show typing indicator in the chat
       */
      showTypingIndicator: function() {
        const { messagesContainer } = this.elements;

        // Remove any existing typing indicators first
        this.removeTypingIndicator();

        const typingIndicator = document.createElement('div');
        typingIndicator.classList.add('shop-ai-typing-indicator');
        typingIndicator.innerHTML = '<span class="dots"><span>•</span><span>•</span><span>•</span></span>';
        messagesContainer.appendChild(typingIndicator);
        this.scrollToBottom();
      },

      /**
       * Remove typing indicator from the chat
       */
      removeTypingIndicator: function() {
        const { messagesContainer } = this.elements;

        const typingIndicator = messagesContainer.querySelector('.shop-ai-typing-indicator');
        if (typingIndicator) {
          typingIndicator.remove();
        }
      },

      /**
       * Show a loader in the product grid position until product_results arrive
       */
      showProductGridLoader: function() {
        const messagesContainer = this.elements?.messagesContainer;
        if (!messagesContainer) return;
        this.removeProductGridLoader();
        const loaderWrap = document.createElement('div');
        loaderWrap.classList.add('shop-ai-product-grid-loader');
        loaderWrap.setAttribute('aria-hidden', 'true');
        loaderWrap.innerHTML = '<div class="shop-ai-product-grid-loader-spinner"></div><span class="shop-ai-product-grid-loader-text">Loading recommendations...</span>';
        const existingQuestions = messagesContainer.querySelector('.shop-ai-suggestive-questions');
        if (existingQuestions) {
          messagesContainer.insertBefore(loaderWrap, existingQuestions);
        } else {
          messagesContainer.appendChild(loaderWrap);
        }
      },

      /**
       * Remove the product grid loader (called when product_results arrive or on end_turn)
       */
      removeProductGridLoader: function() {
        const messagesContainer = this.elements?.messagesContainer;
        if (!messagesContainer) return;
        const loader = messagesContainer.querySelector('.shop-ai-product-grid-loader');
        if (loader) loader.remove();
      },

      /**
       * Display product results in the chat
       * @param {Array} products - Array of product data objects
       * @param {string} sortType - Optional sort type ('most_expensive' or 'least_expensive') or custom header text
       * @param {boolean} skipStorage - Optional flag to skip saving to storage (used when loading from storage)
       */
      displayProductResults: function(products, sortType, skipStorage) {
        const { messagesContainer } = this.elements;

        this.removeProductGridLoader();

        // Create a wrapper for the product section
        const productSection = document.createElement('div');
        productSection.classList.add('shop-ai-product-section');
        
        // Insert before suggestive questions if they exist, otherwise append
        const existingQuestions = messagesContainer.querySelector('.shop-ai-suggestive-questions');
        if (existingQuestions) {
          messagesContainer.insertBefore(productSection, existingQuestions);
        } else {
          messagesContainer.appendChild(productSection);
        }

        // Determine header text dynamically
        let headerText = this.getProductHeaderText(products, sortType);

        // Add a header for the product results
        const header = document.createElement('div');
        header.classList.add('shop-ai-product-header');
        // header.innerHTML = `<h4>${headerText}</h4>`;
        productSection.appendChild(header);

        // Create the product grid container
        const productsContainer = document.createElement('div');
        productsContainer.classList.add('shop-ai-product-grid');
        productSection.appendChild(productsContainer);

        if (!products || !Array.isArray(products) || products.length === 0) {
          const noProductsMessage = document.createElement('p');
          noProductsMessage.textContent = "No products found";
          noProductsMessage.style.padding = "10px";
          productsContainer.appendChild(noProductsMessage);
        } else {
          products.forEach(product => {
            const productCard = ShopAIChat.Product.createCard(product);
            productsContainer.appendChild(productCard);
          });
        }

        // Save products to localStorage for persistence (unless loading from storage)
        if (!skipStorage) {
          ShopAIChat.Storage.saveProducts(products, sortType);
        }

        this.scrollToBottom();
      },

      /**
       * Get dynamic header text based on products and context
       * @param {Array} products - Array of product data objects
       * @param {string} sortType - Sort type or custom header
       * @returns {string} Header text
       */
      getProductHeaderText: function(products, sortType) {
        // If sortType is a custom string (not a predefined sort), use it directly
        if (sortType && sortType !== 'most_expensive' && sortType !== 'least_expensive') {
          return sortType;
        }

        // Handle predefined sort types
        if (sortType === 'most_expensive') {
          return 'Most Expensive Products';
        }
        if (sortType === 'least_expensive') {
          return 'Least Expensive Products';
        }

        // Dynamic header based on product count
        if (!products || products.length === 0) {
          return 'Product Results';
        }
        if (products.length === 1) {
          return 'Product Details';
        }
        
        return 'Recommended Products';
      },

      /**
       * Update image generation progress
       * @param {number} progress - Progress percentage (0-100)
       * @param {HTMLElement} messagesContainer - The messages container
       */
      updateImageGenerationProgress: function(progress, messagesContainer) {
        // Find existing progress container or create one
        let progressContainer = messagesContainer.querySelector('.shop-ai-image-progress-container');
        
        if (!progressContainer) {
          // Create progress container
          progressContainer = document.createElement('div');
          progressContainer.classList.add('shop-ai-image-progress-container');
          
          // Create progress bar container
          const progressBarContainer = document.createElement('div');
          progressBarContainer.classList.add('shop-ai-progress-bar-container');
          
          // Create progress bar
          const progressBar = document.createElement('div');
          progressBar.classList.add('shop-ai-progress-bar');
          progressBarContainer.appendChild(progressBar);
          
          // Create progress text (no title during generation)
          const progressText = document.createElement('div');
          progressText.classList.add('shop-ai-progress-text');
          progressBarContainer.appendChild(progressText);
          
          progressContainer.appendChild(progressBarContainer);
          
          // Wrap in message container
          const messageWrapper = document.createElement('div');
          messageWrapper.classList.add('shop-ai-message', 'assistant', 'shop-ai-image-message');
          messageWrapper.style.maxWidth = '100%';
          messageWrapper.style.padding = '0';
          messageWrapper.style.background = 'transparent';
          messageWrapper.appendChild(progressContainer);
          
          messagesContainer.appendChild(messageWrapper);
          this.scrollToBottom();
        }
        
        // Update progress bar
        const progressBar = progressContainer.querySelector('.shop-ai-progress-bar');
        const progressText = progressContainer.querySelector('.shop-ai-progress-text');
        
        if (progressBar) {
          progressBar.style.width = progress + '%';
        }
        
        if (progressText) {
          progressText.textContent = `${progress}% Image Generated `;
        }
      },

      /**
       * Display generated image from image generation tool
       * @param {string} imageUrl - URL of the generated image
       * @param {HTMLElement} messagesContainer - The messages container
       */
      displayGeneratedImage: function(imageUrl, messagesContainer, skipStorage) {
        console.log('displayGeneratedImage called with:', imageUrl);
        if (!imageUrl || !messagesContainer) {
          console.error('Missing imageUrl or messagesContainer for displayGeneratedImage', {
            imageUrl: !!imageUrl,
            messagesContainer: !!messagesContainer
          });
          return;
        }

        // Remove progress container if it exists
        const progressContainer = messagesContainer.querySelector('.shop-ai-image-progress-container');
        if (progressContainer) {
          const messageWrapper = progressContainer.closest('.shop-ai-message');
          if (messageWrapper) {
            messageWrapper.remove();
          }
        }

        // Create a container for the generated image
        const imageContainer = document.createElement('div');
        imageContainer.classList.add('shop-ai-generated-image-container');
        
        // Create title (only shown when image is ready)
        const title = document.createElement('div');
        title.classList.add('shop-ai-generated-image-title');
        title.textContent = '✨ Virtual Try-On Result';
        imageContainer.appendChild(title);
        
        // Create image wrapper for better control
        const imageWrapper = document.createElement('div');
        imageWrapper.classList.add('shop-ai-generated-image-wrapper');
        
        // Create image element
        const image = document.createElement('img');
        image.alt = 'Virtual try-on result';
        image.classList.add('shop-ai-generated-image');
        image.style.cursor = 'pointer';
        image.title = 'Click to view full size';
        
        // Add click handler to open modal
        image.addEventListener('click', () => {
          this.openImageModal(imageUrl);
        });
        
        image.onload = function() {
          console.log('Generated image loaded successfully, dimensions:', image.naturalWidth, 'x', image.naturalHeight);
          imageWrapper.style.display = 'block';
        };
        
        image.onerror = function() {
          console.error('Failed to load generated image from URL. URL length:', imageUrl?.length);
          console.error('URL preview:', imageUrl?.substring(0, 100));
          const errorDiv = document.createElement('div');
          errorDiv.style.cssText = 'color: #d32f2f; padding: 20px; text-align: center;';
          errorDiv.textContent = '⚠️ Failed to load image. Please try again.';
          imageContainer.appendChild(errorDiv);
          imageWrapper.style.display = 'none';
        };
        
        imageWrapper.appendChild(image);
        imageContainer.appendChild(imageWrapper);
        
        // Set image source after appending to DOM
        console.log('Setting image source, URL length:', imageUrl?.length);
        image.src = imageUrl;
        
        // Wrap the image container in a message-like structure to maintain flow
        const messageWrapper = document.createElement('div');
        messageWrapper.classList.add('shop-ai-message', 'assistant', 'shop-ai-image-message');
        messageWrapper.style.maxWidth = '100%';
        messageWrapper.style.padding = '0';
        messageWrapper.style.background = 'transparent';
        messageWrapper.appendChild(imageContainer);
        
        messagesContainer.appendChild(messageWrapper);
        console.log('Image container added to messages');
        
        // Save generated image to localStorage (unless loading from storage)
        if (!skipStorage) {
          ShopAIChat.Storage.saveGeneratedImage(imageUrl);
        }
        
        this.scrollToBottom();
      },

      /**
       * Display suggestive questions when there's no conversation
       * @param {Array} questions - Array of question strings
       * @param {HTMLElement} messagesContainer - The messages container
       */
      displaySuggestiveQuestions: function(questions, messagesContainer) {
        if (!questions || !Array.isArray(questions) || questions.length === 0) {
          console.warn('No questions provided to displaySuggestiveQuestions');
          return;
        }

        if (!messagesContainer) {
          console.error('No messagesContainer provided to displaySuggestiveQuestions');
          return;
        }

        // Remove any existing suggestive questions first
        const existingQuestions = messagesContainer.querySelector('.shop-ai-suggestive-questions');
        if (existingQuestions) {
          existingQuestions.remove();
        }

        console.log('Displaying suggestive questions:', questions);

        // Create a container for suggestive questions
        const questionsContainer = document.createElement('div');
        questionsContainer.classList.add('shop-ai-suggestive-questions');

        // Create and add each question as a clickable button
        questions.forEach((question, index) => {
          if (!question || typeof question !== 'string') {
            console.warn('Invalid question at index', index, question);
            return;
          }

          const questionButton = document.createElement('button');
          questionButton.classList.add('shop-ai-suggestive-question');
          questionButton.textContent = question;
          questionButton.setAttribute('data-question', question);
          questionButton.type = 'button'; // Prevent form submission
          
          // Add click handler to send the question
          questionButton.addEventListener('click', (e) => {
            e.preventDefault();
            const chatInput = this.elements.chatInput;
            if (chatInput) {
              // Set the input value and send the message
              chatInput.value = question;
              ShopAIChat.Message.send(chatInput, messagesContainer);
              
              // Remove suggestive questions after clicking
              const existingQuestions = messagesContainer.querySelector('.shop-ai-suggestive-questions');
              if (existingQuestions) {
                existingQuestions.remove();
              }
            }
          });
          
          questionsContainer.appendChild(questionButton);
        });

        if (questionsContainer.children.length > 0) {
          messagesContainer.appendChild(questionsContainer);
          this.scrollToBottom();
          console.log('Suggestive questions displayed successfully');
        } else {
          console.warn('No valid questions to display');
        }
      },

      /**
       * Open modal to view full-size generated image
       * @param {string} imageUrl - URL of the image to display
       */
      openImageModal: function(imageUrl) {
        // Create or get the image view modal
        let imageModal = document.getElementById('shop-ai-image-view-modal');
        
        if (!imageModal) {
          // Create modal if it doesn't exist
          imageModal = document.createElement('div');
          imageModal.id = 'shop-ai-image-view-modal';
          imageModal.classList.add('shop-ai-image-view-modal');
          
          const overlay = document.createElement('div');
          overlay.classList.add('shop-ai-image-view-overlay');
          overlay.addEventListener('click', () => this.closeImageModal());
          
          const modalContent = document.createElement('div');
          modalContent.classList.add('shop-ai-image-view-content');
          
          const closeButton = document.createElement('button');
          closeButton.classList.add('shop-ai-image-view-close');
          closeButton.innerHTML = '×';
          closeButton.addEventListener('click', () => this.closeImageModal());
          
          const imageContainer = document.createElement('div');
          imageContainer.classList.add('shop-ai-image-view-image-container');
          
          const fullImage = document.createElement('img');
          fullImage.classList.add('shop-ai-image-view-image');
          fullImage.alt = 'Full size try-on result';
          
          imageContainer.appendChild(fullImage);
          modalContent.appendChild(closeButton);
          modalContent.appendChild(imageContainer);
          imageModal.appendChild(overlay);
          imageModal.appendChild(modalContent);
          
          document.body.appendChild(imageModal);
          
          // Add keyboard listener for ESC key
          this.imageModalKeyHandler = (e) => {
            if (e.key === 'Escape') {
              const modal = document.getElementById('shop-ai-image-view-modal');
              if (modal && modal.classList.contains('active')) {
                this.closeImageModal();
              }
            }
          };
          document.addEventListener('keydown', this.imageModalKeyHandler);
        }
        
        // Set image source and show modal
        const fullImage = imageModal.querySelector('.shop-ai-image-view-image');
        if (fullImage) {
          fullImage.src = imageUrl;
        }
        
        imageModal.classList.add('active');
        document.body.style.overflow = 'hidden';
      },

      /**
       * Close the image view modal
       */
      closeImageModal: function() {
        const imageModal = document.getElementById('shop-ai-image-view-modal');
        if (imageModal) {
          imageModal.classList.remove('active');
          document.body.style.overflow = '';
        }
      },

      /**
       * Add page-specific question when chat opens
       * @param {HTMLElement} messagesContainer - The messages container
       */
      addPageSpecificQuestion: function(messagesContainer) {
        // Only add if there are existing messages (not first time)
        const existingMessages = messagesContainer.querySelectorAll('.shop-ai-message');
        if (existingMessages.length === 0) {
          return; // Don't add on first time when suggestive questions are shown
        }

        // Check if page-specific questions have already been shown for this page URL
        const currentPageUrl = window.location.pathname;
        const pageSpecificKey = `shopAiPageSpecificShown_${currentPageUrl}`;
        const pageSpecificShown = sessionStorage.getItem(pageSpecificKey);
        if (pageSpecificShown) {
          return; // Don't show again if already shown for this page
        }

        const pageType = this.detectPageType();
        const question = this.getPageSpecificQuestion(pageType);
        
        if (question) {
          // Mark page-specific questions as shown for this page URL
          const currentPageUrl = window.location.pathname;
          const pageSpecificKey = `shopAiPageSpecificShown_${currentPageUrl}`;
          sessionStorage.setItem(pageSpecificKey, 'true');
          
          // Get existing suggestive questions from config
          const configQuestions = window.shopChatConfig?.suggestiveQuestions || [];
          const maxQuestions = window.shopChatConfig?.maxSuggestiveQuestions || 4;
          const questionsToShow = configQuestions.slice(0, maxQuestions);
          
          setTimeout(() => {
            // Show regular suggestive questions first
            this.displaySuggestiveQuestions(questionsToShow, messagesContainer);
            
            // Then add page-specific question with different UI
            this.displayPageSpecificQuestion(question, messagesContainer);
          }, 500);
        }
      },

      /**
       * Display page-specific question with different UI styling
       * @param {string} question - The page-specific question
       * @param {HTMLElement} messagesContainer - The messages container
       */
      displayPageSpecificQuestion: function(question, messagesContainer) {
        const pageType = this.detectPageType();
        const enhancedQuestion = this.getEnhancedQuestion(question, pageType);
        
        // Create container for page-specific question
        const pageQuestionContainer = document.createElement('div');
        pageQuestionContainer.classList.add('shop-ai-page-question-container');
        
        // Create the question button with special styling
        const questionButton = document.createElement('button');
        questionButton.classList.add('shop-ai-page-question');
        questionButton.textContent = enhancedQuestion;
        questionButton.setAttribute('data-question', enhancedQuestion);
        questionButton.type = 'button';
        
        // Add click handler
        questionButton.addEventListener('click', (e) => {
          e.preventDefault();
          const chatInput = this.elements.chatInput;
          if (chatInput) {
            chatInput.value = enhancedQuestion;
            ShopAIChat.Message.send(chatInput, messagesContainer);
            
            // Remove both regular and page-specific questions after clicking
            const existingQuestions = messagesContainer.querySelector('.shop-ai-suggestive-questions');
            const existingPageQuestion = messagesContainer.querySelector('.shop-ai-page-question-container');
            if (existingQuestions) existingQuestions.remove();
            if (existingPageQuestion) existingPageQuestion.remove();
          }
        });
        
        pageQuestionContainer.appendChild(questionButton);
        messagesContainer.appendChild(pageQuestionContainer);
        this.scrollToBottom();
      },

      /**
       * Detect the current page type based on URL and page elements
       * @returns {string} Page type identifier
       */
      detectPageType: function() {
        const url = window.location.pathname.toLowerCase();
        
        // Product page detection
        if (url.includes('/products/') || document.querySelector('[data-product-id]') || document.querySelector('.product-form')) {
          return 'product';
        }
        
        // Collection page detection
        if (url.includes('/collections/') || document.querySelector('.collection-grid') || document.querySelector('[data-collection-id]')) {
          return 'collection';
        }
        
        // Cart page detection
        if (url.includes('/cart') || document.querySelector('.cart-form') || document.querySelector('[data-cart]')) {
          return 'cart';
        }
        
        // Checkout page detection
        if (url.includes('/checkout') || document.querySelector('.checkout-form')) {
          return 'checkout';
        }
        
        // Search page detection
        if (url.includes('/search') || document.querySelector('.search-results')) {
          return 'search';
        }
        
        // About/Contact pages
        if (url.includes('/about') || url.includes('/contact')) {
          return 'info';
        }
        
        // Default to home page
        return 'home';
      },

      /**
       * Get page-specific question based on page type
       * @param {string} pageType - The detected page type
       * @returns {string|null} The question to display
       */
      getPageSpecificQuestion: function(pageType) {
        const questions = {
          product: "Tell me more about this product",
          collection: "What are the best products in this collection?",
          cart: "Help me complete my purchase",
          checkout: "I need help with checkout",
          search: "Help me find what I'm looking for",
          info: "What would you like to know about our store?",
          home: "What are your best selling products?"
        };
        
        return questions[pageType] || null;
      },

      /**
       * Get enhanced question with product context for PDP pages
       * @param {string} question - The base question
       * @param {string} pageType - The detected page type
       * @returns {string} Enhanced question with product context
       */
      getEnhancedQuestion: function(question, pageType) {
        // Only enhance product title questions on PDP pages
        if (pageType === 'product' && question.includes('this product')) {
          const productTitle = this.getCurrentProductTitle();
          if (productTitle) {
            return question.replace('this product', productTitle);
          }
        }
        // For all other pages and questions, return as-is
        return question;
      },

      /**
       * Get current product title from the page
       * @returns {string|null} Product title or null
       */
      getCurrentProductTitle: function() {
        // Try multiple selectors to find product title
        const selectors = [
          'h1.product-title',
          'h1[data-product-title]',
          '.product-form h1',
          '.product__title',
          '.product-single__title',
          'h1'
        ];
        
        for (const selector of selectors) {
          const element = document.querySelector(selector);
          if (element && element.textContent.trim()) {
            return element.textContent.trim();
          }
        }
        
        return null;
      }
    },

    /**
     * Message handling and display functionality
     */
    Message: {
      /**
       * Send a message to the API
       * @param {HTMLInputElement} chatInput - The input element
       * @param {HTMLElement} messagesContainer - The messages container
       */
      send: async function(chatInput, messagesContainer) {
        const userMessage = chatInput.value.trim();
        const conversationId = sessionStorage.getItem('shopAiConversationId');

        // Check if there's an uploaded image
        const uploadedImage = ShopAIChat.ImageUpload.getUploadedImage();
        
        // If there's an image but no message, still allow sending (image-only message)
        if (!userMessage && !uploadedImage) {
          return; // Don't send empty messages
        }

        // Remove suggestive questions when user sends a message
        const existingQuestions = messagesContainer.querySelector('.shop-ai-suggestive-questions');
        if (existingQuestions) {
          existingQuestions.remove();
        }

        // Remove page-specific questions when user sends a message
        const existingPageQuestions = messagesContainer.querySelector('.shop-ai-page-question-container');
        if (existingPageQuestions) {
          existingPageQuestions.remove();
        }

        // Remove any lingering image generation progress containers
        const existingProgress = messagesContainer.querySelector('.shop-ai-image-progress-container');
        if (existingProgress) {
          const messageWrapper = existingProgress.closest('.shop-ai-message');
          if (messageWrapper) {
            messageWrapper.remove();
          }
        }

        // Clear product context if this is not an image generation request
        if (!uploadedImage) {
          sessionStorage.removeItem('shopAiCurrentProduct');
        }

        // Store send time and reset timing data
        const sendTime = Date.now();
        sessionStorage.setItem('shopAiMessageSendTime', sendTime.toString());
        sessionStorage.removeItem('shopAiToolTimes');
        sessionStorage.removeItem('shopAiLlmStartTime');

        // Add user message to chat (if there's text)
        if (userMessage) {
          this.add(userMessage, 'user', messagesContainer);
        }

        // Add image to chat if uploaded
        if (uploadedImage) {
          ShopAIChat.ImageUpload.displayUploadedImage(uploadedImage.imageDataUrl, uploadedImage.fileName, messagesContainer);
          // Clear the image preview after sending
          ShopAIChat.ImageUpload.clearImagePreview();
        }

        // Clear input
        chatInput.value = '';

        // Show typing indicator
        ShopAIChat.UI.showTypingIndicator();

        try {
          // Force a small delay to ensure UI updates
          await new Promise(resolve => setTimeout(resolve, 100));
          // Send message with image data if available
          const messageToSend = userMessage || '📷 Image uploaded for try-on';
          ShopAIChat.API.streamResponse(messageToSend, conversationId, messagesContainer, uploadedImage);
        } catch (error) {
          console.error('Error communicating with API:', error);
          ShopAIChat.UI.removeTypingIndicator();
          this.add("Sorry, I couldn't process your request at the moment. Please try again later.", 'assistant', messagesContainer);
        }
      },

      /**
       * Add a message to the chat
       * @param {string} text - Message content
       * @param {string} sender - Message sender ('user' or 'assistant')
       * @param {HTMLElement} messagesContainer - The messages container
       * @param {boolean} skipStorage - Optional flag to skip saving to local storage
       * @returns {HTMLElement} The created message element
       */
      add: function(text, sender, messagesContainer, skipStorage) {
        const messageElement = document.createElement('div');
        messageElement.classList.add('shop-ai-message', sender);

        if (sender === 'assistant') {
          messageElement.dataset.rawText = text;
          ShopAIChat.Formatting.formatMessageContent(messageElement);
        } else {
          messageElement.textContent = text;
        }

        messagesContainer.appendChild(messageElement);
        ShopAIChat.UI.scrollToBottom();

        // Save message to local storage (skip welcome messages and loading messages)
        if (!skipStorage && text && text.trim() && 
            !text.includes('Loading conversation history') &&
            !text.includes('👋 Hi there! How can I help you today?') &&
            !(text.includes('👋') && text.includes('Hi there'))) {
          ShopAIChat.Storage.saveMessage(text, sender);
        }

        return messageElement;
      },

      /**
       * Add a tool use message to the chat with expandable arguments
       * @param {string} toolMessage - Tool use message content
       * @param {HTMLElement} messagesContainer - The messages container
       */
      addToolUse: function(toolMessage, messagesContainer) {
        // Parse the tool message to extract tool name and arguments
        const match = toolMessage.match(/Calling tool: (\w+) with arguments: (.+)/);
        if (!match) {
          // Fallback for unexpected format
          const toolUseElement = document.createElement('div');
          toolUseElement.classList.add('shop-ai-message', 'tool-use');
          toolUseElement.textContent = toolMessage;
          messagesContainer.appendChild(toolUseElement);
          ShopAIChat.UI.scrollToBottom();
          return;
        }

        const toolName = match[1];
        const argsString = match[2];

        // Create the main tool use element
        const toolUseElement = document.createElement('div');
        toolUseElement.classList.add('shop-ai-message', 'tool-use');

        // Create the header (always visible)
        const headerElement = document.createElement('div');
        headerElement.classList.add('shop-ai-tool-header');

        const toolText = document.createElement('span');
        toolText.classList.add('shop-ai-tool-text');
        toolText.textContent = `Calling tool: ${toolName}`;

        const toggleElement = document.createElement('span');
        toggleElement.classList.add('shop-ai-tool-toggle');
        toggleElement.textContent = '[+]';

        headerElement.appendChild(toolText);
        headerElement.appendChild(toggleElement);

        // Create the arguments section (initially hidden)
        const argsElement = document.createElement('div');
        argsElement.classList.add('shop-ai-tool-args');

        try {
          // Try to format JSON arguments nicely
          const parsedArgs = JSON.parse(argsString);
          argsElement.textContent = JSON.stringify(parsedArgs, null, 2);
        } catch (e) {
          // If not valid JSON, just show as-is
          argsElement.textContent = argsString;
        }

        // Add click handler to toggle arguments visibility
        headerElement.addEventListener('click', function() {
          const isExpanded = argsElement.classList.contains('expanded');
          if (isExpanded) {
            argsElement.classList.remove('expanded');
            toggleElement.textContent = '[+]';
          } else {
            argsElement.classList.add('expanded');
            toggleElement.textContent = '[-]';
          }
        });

        // Assemble the complete element
        toolUseElement.appendChild(headerElement);
        toolUseElement.appendChild(argsElement);

        messagesContainer.appendChild(toolUseElement);
        ShopAIChat.UI.scrollToBottom();
      }
    },

    /**
     * Text formatting and markdown handling
     */
    Formatting: {
      /**
       * Format message content with markdown and links
       * @param {HTMLElement} element - The element to format
       */
      formatMessageContent: function(element) {
        if (!element || !element.dataset.rawText) return;

        const rawText = element.dataset.rawText;

        // Process the text with various Markdown features
        let processedText = rawText;

        // Process Markdown links
        const markdownLinkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
        processedText = processedText.replace(markdownLinkRegex, (match, text, url) => {
          // Check if it's an auth URL
          if (url.includes('shopify.com/authentication') &&
             (url.includes('oauth/authorize') || url.includes('authentication'))) {
            // Store the auth URL in a global variable for later use - this avoids issues with onclick handlers
            window.shopAuthUrl = url;
            // Just return normal link that will be handled by the document click handler
            return '<a href="#auth" class="shop-auth-trigger">' + text + '</a>';
          }
          // If it's a checkout link, replace the text
          else if (url.includes('/cart') || url.includes('checkout')) {
            return '<a href="' + url + '" target="_blank" rel="noopener noreferrer">click here to proceed to checkout</a>';
          } else {
            // For normal links, preserve the original text
            return '<a href="' + url + '" target="_blank" rel="noopener noreferrer">' + text + '</a>';
          }
        });

        // Convert text to HTML with proper list handling
        processedText = this.convertMarkdownToHtml(processedText);

        // Apply the formatted HTML
        element.innerHTML = processedText;
      },

      /**
       * Convert Markdown text to HTML with list support
       * @param {string} text - Markdown text to convert
       * @returns {string} HTML content
       */
      convertMarkdownToHtml: function(text) {
        text = text.replace(/(\*\*|__)(.*?)\1/g, '<strong>$2</strong>');
        text = text.replace(/^#{1,6}\s+/gm, '');
        const lines = text.split('\n');
        let currentList = null;
        let listItems = [];
        let htmlContent = '';
        let startNumber = 1;

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          const unorderedMatch = line.match(/^\s*([-*])\s+(.*)/);
          const orderedMatch = line.match(/^\s*(\d+)[\.)]\s+(.*)/);

          if (unorderedMatch) {
            if (currentList !== 'ul') {
              if (currentList === 'ol') {
                htmlContent += `<ol start="${startNumber}">` + listItems.join('') + '</ol>';
                listItems = [];
              }
              currentList = 'ul';
            }
            listItems.push('<li>' + unorderedMatch[2] + '</li>');
          } else if (orderedMatch) {
            if (currentList !== 'ol') {
              if (currentList === 'ul') {
                htmlContent += '<ul>' + listItems.join('') + '</ul>';
                listItems = [];
              }
              currentList = 'ol';
              startNumber = parseInt(orderedMatch[1], 10);
            }
            listItems.push('<li>' + orderedMatch[2] + '</li>');
          } else {
            if (currentList) {
              htmlContent += currentList === 'ul'
                ? '<ul>' + listItems.join('') + '</ul>'
                : `<ol start="${startNumber}">` + listItems.join('') + '</ol>';
              listItems = [];
              currentList = null;
            }

            if (line.trim() === '') {
              htmlContent += '<br>';
            } else {
              htmlContent += '<p>' + line + '</p>';
            }
          }
        }

        if (currentList) {
          htmlContent += currentList === 'ul'
            ? '<ul>' + listItems.join('') + '</ul>'
            : `<ol start="${startNumber}">` + listItems.join('') + '</ol>';
        }

        htmlContent = htmlContent.replace(/<\/p><p>/g, '</p>\n<p>');
        return htmlContent;
      }
    },

    /**
     * API communication and data handling
     */
    API: {
      /**
       * Stream a response from the API
       * @param {string} userMessage - User's message text
       * @param {string} conversationId - Conversation ID for context
       * @param {HTMLElement} messagesContainer - The messages container
       * @param {Object|null} uploadedImage - Uploaded image data (optional)
       */
      streamResponse: async function(userMessage, conversationId, messagesContainer, uploadedImage = null) {
        let currentMessageElement = null;
        const requestId = Date.now() + '-' + Math.random().toString(36).substr(2, 9);
        console.log('Starting new request:', requestId, 'for message:', userMessage);

        try {
          const promptType = window.shopChatConfig?.promptType || "standardAssistant";
          
          const getCartId = () => {
            const cartId = sessionStorage.getItem('shopAiCartId');
            console.log('Retrieved cart ID from session storage:', cartId);
            return cartId;
          };
          
          const cartId = getCartId();
          console.log('Sending cart ID:', cartId);
          
          const currentProduct = sessionStorage.getItem('shopAiCurrentProduct');
          const productContext = currentProduct ? JSON.parse(currentProduct) : null;
          
          const requestBody = JSON.stringify({
            message: userMessage,
            conversation_id: conversationId,
            prompt_type: promptType,
            cart_id: cartId,
            product_context: productContext,
            uploaded_image: uploadedImage ? {
              dataUrl: uploadedImage.imageDataUrl,
              fileName: uploadedImage.fileName
            } : null
          });

          const streamUrl = 'https://52fe-103-187-96-186.ngrok-free.app/chat';
          const shopId = window.shopId;

          const response = await fetch(streamUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'text/event-stream',
              'X-Shopify-Shop-Id': shopId
            },
            body: requestBody
          });

          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';

          // Process the stream
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try {
                  const data = JSON.parse(line.slice(6));
                  this.handleStreamEvent(data, currentMessageElement, messagesContainer, userMessage,
                    (newElement) => { currentMessageElement = newElement; });
                } catch (e) {
                  console.error('Error parsing event data:', e, line);
                }
              }
            }
          }
        } catch (error) {
          console.error('Error in streaming:', error);
          ShopAIChat.UI.removeTypingIndicator();
          ShopAIChat.Message.add("Sorry, I couldn't process your request. Please try again later.",
            'assistant', messagesContainer);
        }
      },

      /**
       * Handle stream events from the API
       * @param {Object} data - Event data
       * @param {HTMLElement} currentMessageElement - Current message element being updated
       * @param {HTMLElement} messagesContainer - The messages container
       * @param {string} userMessage - The original user message
       * @param {Function} updateCurrentElement - Callback to update the current element reference
       */
      handleStreamEvent: function(data, currentMessageElement, messagesContainer, userMessage, updateCurrentElement) {
        switch (data.type) {
          case 'id':
            if (data.conversation_id) {
              sessionStorage.setItem('shopAiConversationId', data.conversation_id);
            }
            break;

          case 'chunk':
            ShopAIChat.UI.removeTypingIndicator();
            // Remove any lingering image generation progress when text chunks arrive
            const imageProgress = messagesContainer.querySelector('.shop-ai-image-progress-container');
            if (imageProgress) {
              const messageWrapper = imageProgress.closest('.shop-ai-message');
              if (messageWrapper) {
                messageWrapper.remove();
              }
            }
            
            // Create message element only when first chunk arrives
            if (!currentMessageElement || !currentMessageElement.parentNode) {
              currentMessageElement = document.createElement('div');
              currentMessageElement.classList.add('shop-ai-message', 'assistant');
              currentMessageElement.textContent = '';
              currentMessageElement.dataset.rawText = '';
              messagesContainer.appendChild(currentMessageElement);
              // Update the current element reference
              updateCurrentElement(currentMessageElement);
              // Show loader in product grid position (visible until product_results or end_turn)
              ShopAIChat.UI.showProductGridLoader();
              ShopAIChat.UI.scrollToBottom();
            }
            
            // Clean chunk to remove suggested questions before displaying
            const cleanedChunk = this.cleanChunkText(data.chunk);
            if (cleanedChunk) {
              currentMessageElement.dataset.rawText += cleanedChunk;
              currentMessageElement.textContent = currentMessageElement.dataset.rawText;
              ShopAIChat.UI.scrollToBottom();
            }
            break;

          case 'message_complete':
            ShopAIChat.UI.removeTypingIndicator();
            // Loader already shown on first chunk; ensure it stays until product_results or end_turn

            // Clean the final message text to remove any suggested questions that might have slipped through
            if (currentMessageElement && currentMessageElement.dataset.rawText) {
              const cleanedText = this.cleanFinalMessageText(currentMessageElement.dataset.rawText);
              currentMessageElement.dataset.rawText = cleanedText;
              currentMessageElement.textContent = cleanedText;
            }
            
            ShopAIChat.Formatting.formatMessageContent(currentMessageElement);
            
            // Save completed assistant message to local storage
            if (currentMessageElement && currentMessageElement.dataset.rawText) {
              const messageText = currentMessageElement.dataset.rawText.trim();
              if (messageText) {
                ShopAIChat.Storage.saveMessage(messageText, 'assistant');
              }
            }
            
            // Calculate and display detailed timing
            const sendTime = sessionStorage.getItem('shopAiMessageSendTime');
            const llmStartTime = sessionStorage.getItem('shopAiLlmStartTime');
            const toolTimes = JSON.parse(sessionStorage.getItem('shopAiToolTimes') || '[]');
            
            if (sendTime) {
              const totalTime = Date.now() - parseInt(sendTime);
              
              // Clean up timing data
              sessionStorage.removeItem('shopAiMessageSendTime');
              sessionStorage.removeItem('shopAiLlmStartTime');
              sessionStorage.removeItem('shopAiToolTimes');
            }
            
            ShopAIChat.UI.scrollToBottom();
            break;

          case 'end_turn':
            ShopAIChat.UI.removeTypingIndicator();
            ShopAIChat.UI.removeProductGridLoader();
            break;

          case 'tool_start':
            const toolStartTime = Date.now();
            let startToolTimes = JSON.parse(sessionStorage.getItem('shopAiToolTimes') || '[]');
            startToolTimes.push({ tool: data.tool_name, start: toolStartTime });
            sessionStorage.setItem('shopAiToolTimes', JSON.stringify(startToolTimes));
            break;

          case 'tool_complete':
            const toolEndTime = Date.now();
            let storedToolTimes = JSON.parse(sessionStorage.getItem('shopAiToolTimes') || '[]');
            const lastTool = storedToolTimes[storedToolTimes.length - 1];
            if (lastTool) {
              const toolDuration = toolEndTime - lastTool.start;
              lastTool.end = toolEndTime;
              lastTool.duration = toolDuration;
              sessionStorage.setItem('shopAiToolTimes', JSON.stringify(storedToolTimes));
            }
            break;

          case 'llm_start':
            sessionStorage.setItem('shopAiLlmStartTime', Date.now().toString());
            break;

          case 'error':
            console.error('Stream error:', data.error);
            ShopAIChat.UI.removeTypingIndicator();
            ShopAIChat.UI.removeProductGridLoader();
            currentMessageElement.textContent = "Sorry, I couldn't process your request. Please try again later.";
            break;

          case 'rate_limit_exceeded':
            console.error('Rate limit exceeded:', data.error);
            ShopAIChat.UI.removeTypingIndicator();
            ShopAIChat.UI.removeProductGridLoader();
            currentMessageElement.textContent = "Sorry, our servers are currently busy. Please try again later.";
            break;

          case 'auth_required':
            // Save the last user message for resuming after authentication
            sessionStorage.setItem('shopAiLastMessage', userMessage || '');
            break;

          case 'product_results':
            ShopAIChat.UI.removeProductGridLoader();
            ShopAIChat.UI.displayProductResults(data.products, data.headerText || data.sortType);
            break;

          case 'image_generation_progress':
            console.log('Received image_generation_progress event:', data.progress);
            // Remove typing indicator when image generation starts
            ShopAIChat.UI.removeTypingIndicator();
            ShopAIChat.UI.updateImageGenerationProgress(data.progress, messagesContainer);
            break;

          case 'image_generation_result':
            console.log('Received image_generation_result event:', data);
            // Remove any image generation progress when result arrives
            const progressContainer = messagesContainer.querySelector('.shop-ai-image-progress-container');
            if (progressContainer) {
              const messageWrapper = progressContainer.closest('.shop-ai-message');
              if (messageWrapper) {
                messageWrapper.remove();
              }
            }
            if (data.image_url) {
              console.log('Displaying generated image:', data.image_url);
              ShopAIChat.UI.displayGeneratedImage(data.image_url, messagesContainer);
            } else {
              console.error('image_generation_result event received but no image_url:', data);
            }
            break;

          case 'tool_use':
            if (data.tool_use_message) {
              ShopAIChat.Message.addToolUse(data.tool_use_message, messagesContainer);
            }
            break;

          case 'suggested_questions':
            if (data.questions && data.questions.length > 0) {
              console.log('Received suggested questions:', data.questions);
              ShopAIChat.UI.displaySuggestiveQuestions(data.questions, messagesContainer);
            }
            break;

          case 'new_message':
            ShopAIChat.Formatting.formatMessageContent(currentMessageElement);
            
            // Remove any lingering image generation progress
            const lingeredProgress = messagesContainer.querySelector('.shop-ai-image-progress-container');
            if (lingeredProgress) {
              const messageWrapper = lingeredProgress.closest('.shop-ai-message');
              if (messageWrapper) {
                messageWrapper.remove();
              }
            }
            
            // Always show typing indicator for new messages (not image generation)
            ShopAIChat.UI.showTypingIndicator();

            // Don't create new message element here - wait for first chunk
            break;

          case 'content_block_complete':
            ShopAIChat.UI.showTypingIndicator();
            break;

          case 'cart_details':
          case 'cart_updated':
            // console.log('Cart event received:', data);
            // Refresh the storefront cart to sync with the updated cart
            if (data.cart && data.cart.id) {
              console.log('Cart updated, refreshing storefront cart');
              // Extract the cart token from the GID
              const cartGid = data.cart.id;
              const cartToken = cartGid.split('/').pop();
              
              // Update session storage with the new cart token
              sessionStorage.setItem('shopAiCartId', cartToken);
              console.log('Updated cart ID in session storage:', cartToken);
              
              // Update the storefront cart by fetching the latest cart state
              fetch('/cart.js')
                .then(response => response.json())
                .then(currentCart => {
                  console.log('Current storefront cart:', currentCart);
                  // If the tokens don't match, we need to sync
                  if (currentCart.token !== cartToken) {
                    console.log('Cart tokens don\'t match, cart may be out of sync');
                  }
                })
                .catch(err => console.error('Error checking cart sync:', err));
            }
            
            // Check if user intent was to checkout and redirect if checkout URL is available
            // console.log('Checking for checkout URL:', data.cart?.checkout_url);
            if (data.cart && data.cart.checkout_url) {
              // console.log('Calling handleCheckoutRedirect');
              ShopAIChat.Utils.handleCheckoutRedirect(userMessage, data.cart.checkout_url);
            } else {
              console.log('No checkout URL found, calling handleCheckoutRedirect anyway');
              ShopAIChat.Utils.handleCheckoutRedirect(userMessage, 'https://example.com/checkout');
            }
            break;
        }
      },

      /**
       * Clean chunk text to remove suggested questions
       * @param {string} chunk - Text chunk from streaming
       * @returns {string} Cleaned chunk text
       */
      cleanChunkText: function(chunk) {
        // If chunk contains the 7 newlines separator, only return the part before it
        const separatorIndex = chunk.indexOf('\n\n\n\n\n\n\n');
        if (separatorIndex !== -1) {
          return chunk.substring(0, separatorIndex);
        }
        return chunk;
      },

      /**
       * Clean final message text to remove suggested questions
       * @param {string} text - Complete message text
       * @returns {string} Cleaned message text
       */
      cleanFinalMessageText: function(text) {
        const separatorIndex = text.indexOf('\n\n\n\n\n\n\n');
        if (separatorIndex !== -1) {
          return text.substring(0, separatorIndex).trim();
        }
        return text;
      },

      /**
       * Fetch chat history from the server
       * @param {string} conversationId - Conversation ID
       * @param {HTMLElement} messagesContainer - The messages container
       */
      fetchChatHistory: async function(conversationId, messagesContainer) {
        try {
          // Show a loading message
          const loadingMessage = document.createElement('div');
          loadingMessage.classList.add('shop-ai-message', 'assistant');
          loadingMessage.textContent = "Loading conversation history...";
          messagesContainer.appendChild(loadingMessage);
          ShopAIChat.UI.scrollToBottom();

          // Fetch history from the server
          const historyUrl = `https://52fe-103-187-96-186.ngrok-free.app/chat?history=true&conversation_id=${encodeURIComponent(conversationId)}`;
          console.log('Fetching history from:', historyUrl);

          const response = await fetch(historyUrl, {
            method: 'GET',
            headers: {
              'Accept': 'application/json',
              'Content-Type': 'application/json'
            },
            mode: 'cors'
          });

          if (!response.ok) {
            console.error('History fetch failed:', response.status, response.statusText);
            throw new Error('Failed to fetch chat history: ' + response.status);
          }

          const data = await response.json();

          // Remove loading message
          messagesContainer.removeChild(loadingMessage);

          // No messages, show welcome message and suggestive questions
          if (!data.messages || data.messages.length === 0) {
            const welcomeMessage = window.shopChatConfig?.welcomeMessage || "👋 Hi there! How can I help you today?";
            ShopAIChat.Message.add(welcomeMessage, 'assistant', messagesContainer);
            
            // Prioritize questions from config (Liquid template), then from API response
            const configQuestions = window.shopChatConfig?.suggestiveQuestions || [];
            const maxQuestions = window.shopChatConfig?.maxSuggestiveQuestions || 4;
            
            if (configQuestions && configQuestions.length > 0) {
              const questionsToShow = configQuestions.slice(0, maxQuestions);
              ShopAIChat.UI.displaySuggestiveQuestions(questionsToShow, messagesContainer);
            } else if (data.suggestiveQuestions && data.suggestiveQuestions.length > 0) {
              ShopAIChat.UI.displaySuggestiveQuestions(data.suggestiveQuestions, messagesContainer);
            }
            return;
          }

          // Add messages to the UI - handle both old JSON format and new text format
          data.messages.forEach(message => {
            try {
              // Try to parse as JSON first (for old messages)
              const messageContents = JSON.parse(message.content);
              if (Array.isArray(messageContents)) {
                for (const contentBlock of messageContents) {
                  if (contentBlock.type === 'text') {
                    ShopAIChat.Message.add(contentBlock.text, message.role, messagesContainer);
                  }
                }
              } else {
                // If it's not an array, treat as plain text
                ShopAIChat.Message.add(message.content, message.role, messagesContainer);
              }
            } catch (e) {
              // If JSON parsing fails, it's plain text (new format)
              ShopAIChat.Message.add(message.content, message.role, messagesContainer);
            }
          });

          // Scroll to bottom
          ShopAIChat.UI.scrollToBottom();

        } catch (error) {
          console.error('Error fetching chat history:', error);

          // Remove loading message if it exists
          const loadingMessage = messagesContainer.querySelector('.shop-ai-message.assistant');
          if (loadingMessage && loadingMessage.textContent === "Loading conversation history...") {
            messagesContainer.removeChild(loadingMessage);
          }

          // Show error and welcome message
          const welcomeMessage = window.shopChatConfig?.welcomeMessage || "👋 Hi there! How can I help you today?";
          ShopAIChat.Message.add(welcomeMessage, 'assistant', messagesContainer);

          // Clear the conversation ID since we couldn't fetch this conversation
          sessionStorage.removeItem('shopAiConversationId');
        }
      },

      /**
       * Fetch suggestive questions from the server
       * @param {HTMLElement} messagesContainer - The messages container
       */
      fetchSuggestiveQuestions: async function(messagesContainer) {
        try {
          // Fetch suggestive questions from the server
          const questionsUrl = `https://52fe-103-187-96-186.ngrok-free.app/chat?suggestive_questions=true`;
          console.log('Fetching suggestive questions from:', questionsUrl);

          const response = await fetch(questionsUrl, {
            method: 'GET',
            headers: {
              'Accept': 'application/json',
              'Content-Type': 'application/json'
            },
            mode: 'cors'
          });

          console.log('Suggestive questions response status:', response.status);

          if (!response.ok) {
            console.error('Suggestive questions fetch failed:', response.status, response.statusText);
            // Fallback: use default questions from config if API fails
            const defaultQuestions = [
              "Hello, how are you?",
              "What is this store about?",
              "Hey, please show me some products",
              "What are your best sellers?"
            ];
            ShopAIChat.UI.displaySuggestiveQuestions(defaultQuestions, messagesContainer);
            return;
          }

          const data = await response.json();
          console.log('Suggestive questions data received:', data);

          // Display suggestive questions if available (replace existing ones)
          if (data.suggestiveQuestions && data.suggestiveQuestions.length > 0) {
            console.log('Updating with server suggestive questions:', data.suggestiveQuestions);
            // Remove existing questions first
            const existingQuestions = messagesContainer.querySelector('.shop-ai-suggestive-questions');
            if (existingQuestions) {
              existingQuestions.remove();
            }
            ShopAIChat.UI.displaySuggestiveQuestions(data.suggestiveQuestions, messagesContainer);
          } else {
            console.log('No suggestive questions in response, keeping defaults');
            // Keep the default questions that were already displayed
          }
        } catch (error) {
          console.error('Error fetching suggestive questions:', error);
          // Fallback: use default questions on error
          const defaultQuestions = [
            "Hello, how are you?",
            "What is this store about?",
            "Hey, please show me some products",
            "What are your best sellers?"
          ];
          ShopAIChat.UI.displaySuggestiveQuestions(defaultQuestions, messagesContainer);
        }
      }
    },

    /**
     * Authentication-related functionality
     */
    Auth: {
      /**
       * Opens an authentication popup window
       * @param {string|HTMLElement} authUrlOrElement - The auth URL or link element that was clicked
       */
      openAuthPopup: function(authUrlOrElement) {
        let authUrl;
        if (typeof authUrlOrElement === 'string') {
          // If a string URL was passed directly
          authUrl = authUrlOrElement;
        } else {
          // If an element was passed
          authUrl = authUrlOrElement.getAttribute('data-auth-url');
          if (!authUrl) {
            console.error('No auth URL found in element');
            return;
          }
        }

        // Open the popup window centered in the screen
        const width = 600;
        const height = 700;
        const left = (window.innerWidth - width) / 2 + window.screenX;
        const top = (window.innerHeight - height) / 2 + window.screenY;

        const popup = window.open(
          authUrl,
          'ShopifyAuth',
          `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
        );

        // Focus the popup window
        if (popup) {
          popup.focus();
        } else {
          // If popup was blocked, show a message
          alert('Please allow popups for this site to authenticate with Shopify.');
        }

        // Start polling for token availability
        const conversationId = sessionStorage.getItem('shopAiConversationId');
        if (conversationId) {
          const messagesContainer = document.querySelector('.shop-ai-chat-messages');

          // Add a message to indicate authentication is in progress
          ShopAIChat.Message.add("Authentication in progress. Please complete the process in the popup window.",
            'assistant', messagesContainer);

          this.startTokenPolling(conversationId, messagesContainer);
        }
      },

      /**
       * Start polling for token availability
       * @param {string} conversationId - Conversation ID
       * @param {HTMLElement} messagesContainer - The messages container
       */
      startTokenPolling: function(conversationId, messagesContainer) {
        if (!conversationId) return;

        console.log('Starting token polling for conversation:', conversationId);
        const pollingId = 'polling_' + Date.now();
        sessionStorage.setItem('shopAiTokenPollingId', pollingId);

        let attemptCount = 0;
        const maxAttempts = 30;

        const poll = async () => {
          if (sessionStorage.getItem('shopAiTokenPollingId') !== pollingId) {
            console.log('Another polling session has started, stopping this one');
            return;
          }

          if (attemptCount >= maxAttempts) {
            console.log('Max polling attempts reached, stopping');
            return;
          }

          attemptCount++;

          try {
            const tokenUrl = 'https://52fe-103-187-96-186.ngrok-free.app/auth/token-status?conversation_id=' +
              encodeURIComponent(conversationId);
            const response = await fetch(tokenUrl);

            if (!response.ok) {
              throw new Error('Token status check failed: ' + response.status);
            }

            const data = await response.json();

            if (data.status === 'authorized') {
              console.log('Token available, resuming conversation');
              const message = sessionStorage.getItem('shopAiLastMessage');

              if (message) {
                sessionStorage.removeItem('shopAiLastMessage');
                setTimeout(() => {
                  ShopAIChat.Message.add("Authorization successful! I'm now continuing with your request.",
                    'assistant', messagesContainer);
                  ShopAIChat.API.streamResponse(message, conversationId, messagesContainer);
                  ShopAIChat.UI.showTypingIndicator();
                }, 500);
              }

              sessionStorage.removeItem('shopAiTokenPollingId');
              return;
            }

            console.log('Token not available yet, polling again in 10s');
            setTimeout(poll, 10000);
          } catch (error) {
            console.error('Error polling for token status:', error);
            setTimeout(poll, 10000);
          }
        };

        setTimeout(poll, 2000);
      }
    },

    /**
     * Product-related functionality
     */
    Product: {
      /**
       * Format price for display. Handles cents (e.g. 5599 -> 55.99), dollars (e.g. 55.99), and "USD 5599" / "USD 55.99".
       * @param {string|number} price - Raw price value
       * @returns {string} Display price (e.g. "55.99" or "USD 55.99")
       */
      formatPrice: function(price) {
        if (price === undefined || price === null) return '';
        const str = String(price).trim();
        // Server (tool.server) already sends major units with 2 decimals, e.g. "USD 7100.00".
        // Do not run the legacy "integer >= 1000 => cents" heuristic on those or we show 71.00 instead of 7100.00.
        if (/^from\s+[A-Z]{3}\s+[\d,]+\.\d{2}$/i.test(str)) return str;
        if (/^[A-Z]{3}\s+[\d,]+\.\d{2}$/.test(str)) return str;
        const currencyMatch = str.match(/^([A-Z]{3})\s+(.+)$/);
        const currency = currencyMatch ? currencyMatch[1] : '';
        const numStr = currencyMatch ? currencyMatch[2] : str;
        const num = Number(numStr.replace(/[^0-9.]/g, ''));
        if (Number.isNaN(num)) return str;
        const isLikelyCents = Number.isInteger(num) && num >= 1000;
        const dollars = isLikelyCents ? (num / 100).toFixed(2) : (num < 1000 ? Number(num).toFixed(2) : (num / 100).toFixed(2));
        return currency ? currency + ' ' + dollars : dollars;
      },

      /**
       * Create a product card element
       * @param {Object} product - Product data
       * @returns {HTMLElement} Product card element
       */
      createCard: function(product) {
        const card = document.createElement('div');
        card.classList.add('shop-ai-product-card');

        // Log the try-on setting for debugging
        // console.log('Creating product card - enableTryOn setting:', window.shopChatConfig?.enableTryOn);
        // console.log('Full shopChatConfig:', window.shopChatConfig);

        // Create image container
        const imageContainer = document.createElement('div');
        imageContainer.classList.add('shop-ai-product-image');

        // Add product image or placeholder
        const image = document.createElement('img');
        image.src = product.image_url || 'https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-image_large.png';
        image.alt = product.title;
        image.onerror = function() {
          // If image fails to load, use a fallback placeholder
          this.src = 'https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-image_large.png';
        };
        imageContainer.appendChild(image);

        // Add Try On Now button overlay (appears on hover) - only if enabled in settings
        const enableTryOn = window.shopChatConfig?.enableTryOn;
        console.log('Try-on check - enableTryOn value:', enableTryOn, 'type:', typeof enableTryOn);
        
        if (enableTryOn === true) {
          console.log('Adding Try-On button to product card');
          const tryOnButton = document.createElement('button');
          tryOnButton.classList.add('shop-ai-try-on-button');
          tryOnButton.textContent = 'Try On Now';
          tryOnButton.dataset.productId = product.id;
          tryOnButton.dataset.productTitle = product.title;
          tryOnButton.dataset.productImage = product.image_url || '';
          
          // Add click handler to open modal
          tryOnButton.addEventListener('click', function(e) {
            e.stopPropagation();
            ShopAIChat.TryOnModal.open(product);
          });
          
          imageContainer.appendChild(tryOnButton);
        } else {
          console.log('Try-On button disabled - not adding to product card');
        }
        
        card.appendChild(imageContainer);

        // Add product info
        const info = document.createElement('div');
        info.classList.add('shop-ai-product-info');

        // Add product title (link only when URL is provided and non-empty)
        const title = document.createElement('h3');
        title.classList.add('shop-ai-product-title');
        const hasUrl = product.url && String(product.url).trim();
        if (hasUrl) {
          const titleLink = document.createElement('a');
          titleLink.href = product.url;
          titleLink.target = '_blank';
          titleLink.rel = 'noopener noreferrer';
          titleLink.textContent = product.title;
          title.appendChild(titleLink);
        } else {
          title.textContent = product.title;
        }
        info.appendChild(title);

        // Add product price (display divided by 100)
        const price = document.createElement('p');
        price.classList.add('shop-ai-product-price');
        price.textContent = ShopAIChat.Product.formatPrice(product.price) || product.price || '';
        info.appendChild(price);

        // Add add-to-cart button
        const button = document.createElement('button');
        button.classList.add('shop-ai-add-to-cart');
        button.textContent = 'Add to Cart';
        button.dataset.productId = product.id;

        // Add click handler for the button
        button.addEventListener('click', function() {
          // Send message to add this product to cart
          const input = document.querySelector('.shop-ai-chat-input input');
          if (input) {
            input.value = `Add ${product.title} to my cart`;
            // Trigger a click on the send button
            const sendButton = document.querySelector('.shop-ai-chat-send');
            if (sendButton) {
              sendButton.click();
            }
          }
        });

        info.appendChild(button);
        card.appendChild(info);

        return card;
      }
    },

    /**
     * Try On Modal functionality
     */
    TryOnModal: {
      /**
       * Initialize modal event listeners
       */
      init: function() {
        // Close button
        const closeButton = document.getElementById('shop-ai-modal-close');
        if (closeButton) {
          closeButton.addEventListener('click', () => this.close());
        }

        // Cancel button
        const cancelButton = document.getElementById('shop-ai-modal-cancel');
        if (cancelButton) {
          cancelButton.addEventListener('click', () => this.close());
        }

        // Submit button
        const submitButton = document.getElementById('shop-ai-modal-submit');
        if (submitButton) {
          submitButton.addEventListener('click', () => this.processTryOn());
        }

        // Upload button
        const uploadButton = document.getElementById('shop-ai-modal-upload-button');
        const fileInput = document.getElementById('shop-ai-modal-image-upload');
        if (uploadButton && fileInput) {
          uploadButton.addEventListener('click', () => {
            fileInput.click();
          });
        }

        // File input change handler
        if (fileInput) {
          fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
              this.handleModalImageUpload(file);
              fileInput.value = '';
            }
          });
        }

        // Close on overlay click
        const overlay = document.querySelector('.shop-ai-modal-overlay');
        if (overlay) {
          overlay.addEventListener('click', () => this.close());
        }

        // Close on Escape key
        document.addEventListener('keydown', (e) => {
          if (e.key === 'Escape') {
            const modal = document.getElementById('shop-ai-try-on-modal');
            if (modal && modal.classList.contains('active')) {
              this.close();
            }
          }
        });
      },

      /**
       * Open the try-on modal with product information
       * @param {Object} product - Product data object
       */
      open: function(product) {
        const modal = document.getElementById('shop-ai-try-on-modal');
        const modalProductImage = document.getElementById('shop-ai-modal-product-image');
        const modalProductTitle = document.getElementById('shop-ai-modal-product-title');
        const modalProductPrice = document.getElementById('shop-ai-modal-product-price');
        
        if (!modal) return;
        
        // Set product information in modal
        if (modalProductImage) {
          modalProductImage.src = product.image_url || 'https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-image_large.png';
          modalProductImage.alt = product.title;
        }
        
        if (modalProductTitle) {
          modalProductTitle.textContent = product.title;
        }
        
        if (modalProductPrice) {
          modalProductPrice.textContent = ShopAIChat.Product.formatPrice(product.price) || product.price || '';
        }
        
        // Store product data for later use
        modal.dataset.productId = product.id || '';
        modal.dataset.productTitle = product.title || '';
        
        // Show modal
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
        
        // Focus on file input or upload button
        const fileInput = document.getElementById('shop-ai-modal-image-upload');
        if (fileInput) {
          // Small delay to ensure modal is visible
          setTimeout(() => {
            const uploadButton = document.querySelector('.shop-ai-modal-upload-button');
            if (uploadButton) {
              uploadButton.focus();
            }
          }, 100);
        }
      },

      /**
       * Close the try-on modal
       */
      close: function() {
        const modal = document.getElementById('shop-ai-try-on-modal');
        if (!modal) return;
        
        modal.classList.remove('active');
        document.body.style.overflow = '';
        
        // Hide loader if visible
        this.hideModalLoader();
        
        // Clear any uploaded image preview in modal
        const modalImagePreview = document.getElementById('shop-ai-modal-image-preview');
        const modalFileInput = document.getElementById('shop-ai-modal-image-upload');
        const uploadText = document.querySelector('.shop-ai-modal-upload-text');
        
        if (modalImagePreview) {
          modalImagePreview.src = '';
          modalImagePreview.style.display = 'none';
        }
        
        if (modalFileInput) {
          modalFileInput.value = '';
        }
        
        if (uploadText) {
          uploadText.style.display = 'block';
        }
        
        // Re-enable buttons
        const closeButton = document.getElementById('shop-ai-modal-close');
        const cancelButton = document.getElementById('shop-ai-modal-cancel');
        if (closeButton) closeButton.disabled = false;
        if (cancelButton) cancelButton.disabled = false;
      },

      /**
       * Handle image upload in modal
       * @param {File} file - The image file
       */
      handleModalImageUpload: function(file) {
        const modalImagePreview = document.getElementById('shop-ai-modal-image-preview');
        const modalUploadArea = document.querySelector('.shop-ai-modal-upload-area');
        
        // Validate file type
        if (!file.type.startsWith('image/')) {
          alert('Please select a valid image file.');
          return;
        }

        // Validate file size (max 10MB)
        const maxSize = 10 * 1024 * 1024; // 10MB in bytes
        if (file.size > maxSize) {
          alert('Image size must be less than 10MB. Please select a smaller image.');
          return;
        }

        // Create FileReader to read the image
        const reader = new FileReader();
        
        reader.onload = function(e) {
          const imageDataUrl = e.target.result;
          
          // Show preview
          if (modalImagePreview) {
            modalImagePreview.src = imageDataUrl;
            modalImagePreview.style.display = 'block';
          }
          
          // Hide upload area text
          if (modalUploadArea) {
            const uploadText = modalUploadArea.querySelector('.shop-ai-modal-upload-text');
            if (uploadText) {
              uploadText.style.display = 'none';
            }
          }
          
          // Store image for try-on
          sessionStorage.setItem('shopAiTryOnImage', imageDataUrl);
          sessionStorage.setItem('shopAiTryOnImageName', file.name);
          
          console.log('Image uploaded for try-on:', file.name);
        };
        
        reader.onerror = function() {
          alert('Error reading the image file. Please try again.');
        };
        
        // Read the file as data URL
        reader.readAsDataURL(file);
      },

      /**
       * Convert image URL to base64 data URL
       * @param {string} imageUrl - Image URL
       * @returns {Promise<string>} Base64 data URL
       */
      convertImageUrlToBase64: function(imageUrl) {
        return new Promise((resolve, reject) => {
          // If already a data URL, return as is
          if (imageUrl.startsWith('data:image/')) {
            resolve(imageUrl);
            return;
          }

          // Create an image element to load the URL
          const img = new Image();
          img.crossOrigin = 'anonymous'; // Enable CORS for external images
          
          img.onload = function() {
            try {
              // Create canvas to convert image to base64
              const canvas = document.createElement('canvas');
              canvas.width = img.width;
              canvas.height = img.height;
              
              const ctx = canvas.getContext('2d');
              ctx.drawImage(img, 0, 0);
              
              // Convert to base64
              const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
              resolve(dataUrl);
            } catch (error) {
              reject(new Error('Failed to convert image to base64: ' + error.message));
            }
          };
          
          img.onerror = function() {
            reject(new Error('Failed to load product image. Please check if the image URL is accessible.'));
          };
          
          img.src = imageUrl;
        });
      },

      /**
       * Show loader in modal
       */
      showModalLoader: function() {
        const loader = document.getElementById('shop-ai-modal-loader');
        const uploadSection = document.querySelector('.shop-ai-modal-upload-section');
        const footer = document.querySelector('.shop-ai-modal-footer');
        
        if (loader) {
          loader.style.display = 'flex';
        }
        
        // Hide upload section and footer during processing
        if (uploadSection) {
          uploadSection.style.display = 'none';
        }
        if (footer) {
          footer.style.display = 'none';
        }
      },

      /**
       * Hide loader in modal
       */
      hideModalLoader: function() {
        const loader = document.getElementById('shop-ai-modal-loader');
        const uploadSection = document.querySelector('.shop-ai-modal-upload-section');
        const footer = document.querySelector('.shop-ai-modal-footer');
        
        if (loader) {
          loader.style.display = 'none';
        }
        
        // Show upload section and footer again
        if (uploadSection) {
          uploadSection.style.display = 'block';
        }
        if (footer) {
          footer.style.display = 'flex';
        }
      },

      /**
       * Process try-on (send image and product to backend via chat API)
       */
      processTryOn: async function() {
        const modal = document.getElementById('shop-ai-try-on-modal');
        if (!modal) {
          console.error('Try-on modal not found');
          return;
        }
        
        // Get user image from session storage
        const tryOnImage = sessionStorage.getItem('shopAiTryOnImage');
        if (!tryOnImage) {
          alert('Please upload an image first.');
          return;
        }
        
        // Get product info from modal
        const productId = modal.dataset.productId || '';
        const productTitle = modal.dataset.productTitle || '';
        const modalProductImage = document.getElementById('shop-ai-modal-product-image');
        
        // Get product image from modal
        let productImageUrl = '';
        if (modalProductImage && modalProductImage.src) {
          productImageUrl = modalProductImage.src;
        }
        
        if (!productImageUrl) {
          alert('Product image not found. Please try again.');
          return;
        }
        
        // Show loader in modal (keep modal open)
        this.showModalLoader();
        
        // Disable close button and cancel button during processing
        const closeButton = document.getElementById('shop-ai-modal-close');
        const cancelButton = document.getElementById('shop-ai-modal-cancel');
        if (closeButton) closeButton.disabled = true;
        if (cancelButton) cancelButton.disabled = true;
        
        const messagesContainer = ShopAIChat.UI.elements.messagesContainer;
        
        try {
          // Convert product image URL to base64 if needed
          let productImageDataUrl = productImageUrl;
          if (!productImageUrl.startsWith('data:image/')) {
            try {
              productImageDataUrl = await this.convertImageUrlToBase64(productImageUrl);
              console.log('Product image converted to base64');
            } catch (conversionError) {
              console.error('Error converting product image:', conversionError);
              this.hideModalLoader();
              if (closeButton) closeButton.disabled = false;
              if (cancelButton) cancelButton.disabled = false;
              alert(`Error loading product image: ${conversionError.message}`);
              return;
            }
          }
          
          // Prepare uploaded image object (matching format expected by streamResponse)
          const uploadedImage = {
            imageDataUrl: tryOnImage,
            fileName: sessionStorage.getItem('shopAiTryOnImageName') || 'uploaded-image.jpg'
          };
          
          // Prepare product context with image
          const productContext = {
            id: productId,
            title: productTitle,
            image_url: productImageDataUrl
          };
          
          // Store product context in session storage for the chat API
          sessionStorage.setItem('shopAiCurrentProduct', JSON.stringify(productContext));
          
          // Get conversation ID
          const conversationId = sessionStorage.getItem('shopAiConversationId') || Date.now().toString();
          if (!sessionStorage.getItem('shopAiConversationId')) {
            sessionStorage.setItem('shopAiConversationId', conversationId);
          }
          
          // Close modal and clear try-on image from session storage
          this.close();
          sessionStorage.removeItem('shopAiTryOnImage');
          sessionStorage.removeItem('shopAiTryOnImageName');
          
          // Re-enable buttons
          if (closeButton) closeButton.disabled = false;
          if (cancelButton) cancelButton.disabled = false;
          
          // Send message to chat API with try-on request
          const tryOnMessage = productTitle 
            ? `Can I try on ${productTitle}?` 
            : 'Can I try this on?';
          
          // Use the streamResponse function to send the request
          await ShopAIChat.API.streamResponse(tryOnMessage, conversationId, messagesContainer, uploadedImage);
          
        } catch (error) {
          console.error('Error processing try-on:', error);
          this.hideModalLoader();
          if (closeButton) closeButton.disabled = false;
          if (cancelButton) cancelButton.disabled = false;
          alert(`Error processing try-on: ${error.message}`);
        }
        
        /* 
        // TRY-ON API CODE - TEMPORARILY DISABLED
        // Uncomment below when ready to re-enable try-on functionality
        
        const userImageDataUrl = tryOnImage;
        const modalProductImage = document.getElementById('shop-ai-modal-product-image');
        
        // Get product image from modal
        let productImageUrl = '';
        if (modalProductImage && modalProductImage.src) {
          productImageUrl = modalProductImage.src;
        }
        
        if (!productImageUrl) {
          alert('Product image not found. Please try again.');
          return;
        }
        
        // Show loader in modal (keep modal open)
        this.showModalLoader();
        
        // Disable close button and cancel button during processing
        const closeButton = document.getElementById('shop-ai-modal-close');
        const cancelButton = document.getElementById('shop-ai-modal-cancel');
        if (closeButton) closeButton.disabled = true;
        if (cancelButton) cancelButton.disabled = true;
        
        const messagesContainer = ShopAIChat.UI.elements.messagesContainer;
        
        try {
          // Convert product image URL to base64 if needed
          let productImageDataUrl = productImageUrl;
          if (!productImageUrl.startsWith('data:image/')) {
            try {
              productImageDataUrl = await this.convertImageUrlToBase64(productImageUrl);
              console.log('Product image converted to base64');
            } catch (conversionError) {
              console.error('Error converting product image:', conversionError);
              this.hideModalLoader();
              if (closeButton) closeButton.disabled = false;
              if (cancelButton) cancelButton.disabled = false;
              alert(`Error loading product image: ${conversionError.message}`);
              return;
            }
          }
          
          // Get provider from config (default to "openai")
          const tryOnProvider = window.shopChatConfig?.tryOnProvider || "openai";
          
          // Call the try-on API
          console.log('Calling try-on API with provider:', tryOnProvider);
          console.log('shopChatConfig:', window.shopChatConfig);
          const response = await fetch('https://92b0bbbac78e.ngrok-free.app/api/try-on', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              userImage: userImageDataUrl,
              productImage: productImageDataUrl,
              productId: productId,
              productTitle: productTitle,
              provider: tryOnProvider,
              prompt: "Try making the model wear the apparel shown in the image. Preserve lighting and proportions."
            })
          });
          
          if (!response.ok) {
            const errorText = await response.text();
            let errorData;
            try {
              errorData = JSON.parse(errorText);
            } catch (e) {
              errorData = { error: errorText || `HTTP ${response.status}` };
            }
            throw new Error(errorData.error || `API request failed with status ${response.status}`);
          }
          
          const result = await response.json();
          
          // Hide loader and close modal
          this.hideModalLoader();
          this.close();
          
          // Re-enable buttons
          if (closeButton) closeButton.disabled = false;
          if (cancelButton) cancelButton.disabled = false;
          
          if (result.success && result.imageDataUrl) {
            // Display the generated try-on image in chat
            if (messagesContainer) {
              const tryOnMessage = document.createElement('div');
              tryOnMessage.classList.add('shop-ai-message', 'assistant', 'try-on-result');
              
              const tryOnContainer = document.createElement('div');
              tryOnContainer.classList.add('shop-ai-try-on-result-container');
              
              const tryOnTitle = document.createElement('div');
              tryOnTitle.classList.add('shop-ai-try-on-title');
              tryOnTitle.textContent = `✨ Try-On Result for ${productTitle}`;
              
              const tryOnImage = document.createElement('img');
              tryOnImage.src = result.imageDataUrl;
              tryOnImage.alt = `Try-on result for ${productTitle}`;
              tryOnImage.classList.add('shop-ai-try-on-result-image');
              tryOnImage.onerror = function() {
                console.error('Failed to load try-on result image');
                ShopAIChat.Message.add(
                  '❌ Failed to display try-on result image.',
                  'assistant',
                  messagesContainer
                );
              };
              
              tryOnContainer.appendChild(tryOnTitle);
              tryOnContainer.appendChild(tryOnImage);
              tryOnMessage.appendChild(tryOnContainer);
              
              messagesContainer.appendChild(tryOnMessage);
              ShopAIChat.UI.scrollToBottom();
              
              console.log('Try-on image generated and displayed successfully');
            }
          } else {
            // Show error message in chat
            if (messagesContainer) {
              ShopAIChat.Message.add(
                `❌ Failed to generate try-on image: ${result.error || 'Unknown error'}`,
                'assistant',
                messagesContainer
              );
            }
          }
        } catch (error) {
          console.error('Error processing try-on:', error);
          this.hideModalLoader();
          
          // Re-enable buttons
          if (closeButton) closeButton.disabled = false;
          if (cancelButton) cancelButton.disabled = false;
          
          // Show error in modal or chat
          alert(`Error processing try-on: ${error.message || 'Please try again later.'}`);
        }
        
        // Clear try-on image from session storage after processing
        sessionStorage.removeItem('shopAiTryOnImage');
        sessionStorage.removeItem('shopAiTryOnImageName');
        */
      }
    },

    /**
     * Utility functions
     */
    Utils: {
      /**
       * Check if user message indicates checkout intent and redirect if so
       * @param {string} userMessage - The user's message
       * @param {string} checkoutUrl - The checkout URL from the cart
       */
      handleCheckoutRedirect: function(userMessage, checkoutUrl) {
        if (!userMessage || !checkoutUrl) return;
        
        const checkoutKeywords = [
          'checkout', 'check out', 'take me to checkout', 'go to checkout',
          'proceed to checkout', 'complete purchase', 'buy now', 'purchase',
          'pay now', 'finish order', 'complete order', 'go to cart',
          'i want to checkout', 'ready to checkout', 'let me checkout',
          'take me to the checkout', 'i\'d like to checkout', 'time to checkout',
          'ready to buy', 'ready to purchase', 'want to buy', 'want to purchase'
        ];
        
        const messageText = userMessage.toLowerCase();
        const hasCheckoutIntent = checkoutKeywords.some(keyword => 
          messageText.includes(keyword)
        );
        
        if (hasCheckoutIntent) {
          console.log('Checkout intent detected, redirecting to:', checkoutUrl);
          
          // Add a message to indicate redirect is happening
          const messagesContainer = ShopAIChat.UI.elements.messagesContainer;
          if (messagesContainer) {
            ShopAIChat.Message.add('🛒 Taking you to checkout!', 'assistant', messagesContainer);
          }
          
          // Small delay to allow the message to be visible
          setTimeout(() => {
            window.open(checkoutUrl, '_blank');
          }, 1500);
        }
      }
    },

    /**
     * Voice recognition functionality
     */
    Voice: {
      recognition: null,
      isListening: false,
      isSupported: false,

      /**
       * Initialize voice recognition
       */
      init: function() {
        // Enhanced browser support detection
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        
        if (!SpeechRecognition) {
          console.warn('Speech recognition not supported in this browser');
          this.isSupported = false;
          return;
        }

        // Additional check for Chrome-specific requirements
        if (navigator.userAgent.indexOf('Chrome') === -1 && navigator.userAgent.indexOf('Chromium') === -1) {
          console.warn('Speech recognition works best in Chrome/Chromium browsers');
          // Still allow it to work in other browsers that support it
        }

        this.isSupported = true;
        this.recognition = new SpeechRecognition();
        
        // Configure recognition settings
        this.recognition.continuous = false;
        this.recognition.interimResults = false;
        this.recognition.lang = 'en-US';
        this.recognition.maxAlternatives = 1;

        // Set up event handlers
        this.setupRecognitionHandlers();
        
        console.log('Voice recognition initialized successfully');
      },

      /**
       * Set up speech recognition event handlers
       */
      setupRecognitionHandlers: function() {
        if (!this.recognition) return;

        const { chatInput, voiceButton } = ShopAIChat.UI.elements;

        // When speech is recognized
        this.recognition.onresult = (event) => {
          console.log('Speech recognition result:', event.results);
          const transcript = event.results[0][0].transcript;
          if (transcript && transcript.trim()) {
            // Insert transcribed text into input
            chatInput.value = transcript.trim();
            
            // Auto-send the message
            if (chatInput.value.trim() !== '') {
              ShopAIChat.Message.send(chatInput, ShopAIChat.UI.elements.messagesContainer);
            }
          }
          this.stopListening();
        };

        // When recognition ends
        this.recognition.onend = () => {
          console.log('Speech recognition ended');
          this.stopListening();
        };

        // When an error occurs
        this.recognition.onerror = (event) => {
          console.error('Speech recognition error:', event.error);
          
          let errorMessage = 'Voice recognition failed.';
          
          switch (event.error) {
            case 'not-allowed':
              errorMessage = 'Microphone access denied. Please allow microphone access in your browser settings and try again.';
              break;
            case 'no-speech':
              errorMessage = 'No speech detected. Please try again.';
              break;
            case 'audio-capture':
              errorMessage = 'Audio capture failed. Please check your microphone and try again.';
              break;
            case 'network':
              errorMessage = 'Network error. Please check your connection and try again.';
              break;
            case 'aborted':
              errorMessage = 'Voice recognition was aborted. Please try again.';
              break;
            case 'service-not-allowed':
              errorMessage = 'Voice recognition service not allowed. Please check your browser settings.';
              break;
            default:
              errorMessage = `Voice recognition error: ${event.error}. Please try again.`;
          }
          
          // Show error message to user
          ShopAIChat.Message.add(errorMessage, 'assistant', ShopAIChat.UI.elements.messagesContainer);
          this.stopListening();
        };

        // When recognition starts
        this.recognition.onstart = () => {
          console.log('Speech recognition started');
          this.isListening = true;
          this.updateVoiceButtonState();
        };
      },

      /**
       * Toggle voice recognition on/off
       */
      toggleVoiceRecognition: function() {
        if (!this.isSupported) {
          ShopAIChat.Message.add('Voice recognition is not supported in your browser. Please use Chrome or another modern browser.', 'assistant', ShopAIChat.UI.elements.messagesContainer);
          return;
        }

        if (this.isListening) {
          this.stopListening();
        } else {
          this.startListening();
        }
      },

      /**
       * Start voice recognition
       */
      startListening: function() {
        if (!this.recognition || this.isListening) return;

        // Check microphone permissions first
        if (navigator.permissions) {
          navigator.permissions.query({name: 'microphone'}).then(permissionStatus => {
            console.log('Microphone permission status:', permissionStatus.state);
            
            if (permissionStatus.state === 'denied') {
              ShopAIChat.Message.add('Microphone access is blocked. Please allow microphone access in your browser settings and refresh the page.', 'assistant', ShopAIChat.UI.elements.messagesContainer);
              return;
            }
            
            this.startRecognition();
          }).catch(() => {
            // Fallback if permissions API is not available
            this.startRecognition();
          });
        } else {
          // Fallback for browsers without permissions API
          this.startRecognition();
        }
      },

      /**
       * Actually start the recognition process
       */
      startRecognition: function() {
        try {
          console.log('Starting speech recognition...');
          this.recognition.start();
        } catch (error) {
          console.error('Failed to start speech recognition:', error);
          ShopAIChat.Message.add('Failed to start voice recognition. Please try again.', 'assistant', ShopAIChat.UI.elements.messagesContainer);
        }
      },

      /**
       * Stop voice recognition
       */
      stopListening: function() {
        if (!this.recognition || !this.isListening) return;

        try {
          console.log('Stopping speech recognition...');
          this.recognition.stop();
        } catch (error) {
          console.error('Failed to stop speech recognition:', error);
        }

        this.isListening = false;
        this.updateVoiceButtonState();
      },

      /**
       * Update voice button visual state
       */
      updateVoiceButtonState: function() {
        const { voiceButton } = ShopAIChat.UI.elements;
        if (!voiceButton) return;

        const statusElement = voiceButton.querySelector('.shop-ai-voice-status');
        
        if (this.isListening) {
          voiceButton.classList.add('listening');
          voiceButton.disabled = true;
          if (statusElement) {
            statusElement.classList.add('show');
          }
        } else {
          voiceButton.classList.remove('listening');
          voiceButton.disabled = false;
          if (statusElement) {
            statusElement.classList.remove('show');
          }
        }
      }
    },

    /**
     * Image upload functionality for try-on feature
     */
    ImageUpload: {
      /**
       * Handle image file upload
       * @param {File} file - The image file to upload
       */
      handleImageUpload: function(file) {
        const { imagePreviewContainer, imagePreview, messagesContainer } = ShopAIChat.UI.elements;

        // Validate file type
        if (!file.type.startsWith('image/')) {
          ShopAIChat.Message.add('Please select a valid image file.', 'assistant', messagesContainer);
          return;
        }

        // Validate file size (max 10MB)
        const maxSize = 10 * 1024 * 1024; // 10MB in bytes
        if (file.size > maxSize) {
          ShopAIChat.Message.add('Image size must be less than 10MB. Please select a smaller image.', 'assistant', messagesContainer);
          return;
        }

        // Create FileReader to read the image
        const reader = new FileReader();
        
        reader.onload = function(e) {
          const imageDataUrl = e.target.result;
          
          // Store image in sessionStorage for potential use with try-on feature
          sessionStorage.setItem('shopAiUploadedImage', imageDataUrl);
          sessionStorage.setItem('shopAiUploadedImageName', file.name);
          
          // Show preview in input bar
          if (imagePreview && imagePreviewContainer) {
            imagePreview.src = imageDataUrl;
            imagePreview.alt = file.name;
            imagePreviewContainer.style.display = 'flex';
          }
          
          console.log('Image uploaded:', file.name, 'Size:', file.size, 'Type:', file.type);
        };
        
        reader.onerror = function() {
          ShopAIChat.Message.add('Error reading the image file. Please try again.', 'assistant', messagesContainer);
        };
        
        // Read the file as data URL
        reader.readAsDataURL(file);
      },

      /**
       * Clear image preview from input bar
       */
      clearImagePreview: function() {
        const { imagePreviewContainer, imagePreview } = ShopAIChat.UI.elements;
        
        if (imagePreviewContainer) {
          imagePreviewContainer.style.display = 'none';
        }
        
        if (imagePreview) {
          imagePreview.src = '';
          imagePreview.alt = '';
        }
        
        // Clear from session storage
        this.clearUploadedImage();
      },

      /**
       * Display uploaded image in the chat
       * @param {string} imageDataUrl - The image data URL
       * @param {string} fileName - The name of the uploaded file
       * @param {HTMLElement} messagesContainer - The messages container
       */
      displayUploadedImage: function(imageDataUrl, fileName, messagesContainer) {
        // Create image message element
        const imageMessage = document.createElement('div');
        imageMessage.classList.add('shop-ai-message', 'user', 'image-message');
        
        // Create image container
        const imageContainer = document.createElement('div');
        imageContainer.classList.add('shop-ai-uploaded-image-container');
        
        // Create image element
        const img = document.createElement('img');
        img.src = imageDataUrl;
        img.alt = fileName;
        img.classList.add('shop-ai-uploaded-image');
        
        // Create image info
        const imageInfo = document.createElement('div');
        imageInfo.classList.add('shop-ai-image-info');
        imageInfo.textContent = `📷 ${fileName}`;
        
        imageContainer.appendChild(img);
        imageContainer.appendChild(imageInfo);
        imageMessage.appendChild(imageContainer);
        
        messagesContainer.appendChild(imageMessage);
        ShopAIChat.UI.scrollToBottom();
      },

      /**
       * Get the uploaded image from session storage
       * @returns {Object|null} Object with imageDataUrl and fileName, or null if no image
       */
      getUploadedImage: function() {
        const imageDataUrl = sessionStorage.getItem('shopAiUploadedImage');
        const fileName = sessionStorage.getItem('shopAiUploadedImageName');
        
        if (imageDataUrl && fileName) {
          return {
            imageDataUrl: imageDataUrl,
            fileName: fileName
          };
        }
        
        return null;
      },

      /**
       * Clear the uploaded image from session storage
       */
      clearUploadedImage: function() {
        sessionStorage.removeItem('shopAiUploadedImage');
        sessionStorage.removeItem('shopAiUploadedImageName');
      }
    },

    /**
     * Utility functions
     */
    Utils: {
      /**
       * Check if user message indicates checkout intent and redirect if so
       * @param {string} userMessage - The user's message
       * @param {string} checkoutUrl - The checkout URL from the cart
       */
      handleCheckoutRedirect: function(userMessage, checkoutUrl) {
        // console.log('handleCheckoutRedirect called with:', userMessage, checkoutUrl);
        if (!userMessage || !checkoutUrl) return;
        
        const checkoutKeywords = [
          'checkout', 'check out', 'take me to checkout', 'go to checkout',
          'proceed to checkout', 'complete purchase', 'buy now', 'purchase',
          'pay now', 'finish order', 'complete order', 'go to cart',
          'i want to checkout', 'ready to checkout', 'let me checkout',
          'take me to the checkout', 'i\'d like to checkout', 'time to checkout',
          'ready to buy', 'ready to purchase', 'want to buy', 'want to purchase',
          'take me to', 'take me'
        ];
        
        const messageText = userMessage.toLowerCase().trim();
        // console.log('Message text:', messageText);
        
        const hasCheckoutIntent = checkoutKeywords.some(keyword => {
          const match = messageText.includes(keyword);
          // console.log(`Checking keyword "${keyword}": ${match}`);
          return match;
        });
        
        // console.log('Checkout intent detected:', hasCheckoutIntent);
        
        if (hasCheckoutIntent) {
          console.log('Checkout intent detected, redirecting to:', checkoutUrl);
          
          // Add a message to indicate redirect is happening
          const messagesContainer = ShopAIChat.UI.elements.messagesContainer;
          if (messagesContainer) {
            ShopAIChat.Message.add('🛒 Taking you to checkout!', 'assistant', messagesContainer);
          }
          
          // Small delay to allow the message to be visible
          setTimeout(() => {
            window.open(checkoutUrl, '_blank');
          }, 1500);
        }
      }
    },

    /**
     * Local storage management for chat messages
     */
    Storage: {
      /**
       * Storage key for chat messages
       */
      STORAGE_KEY: 'shopAiChatMessages',
      
      /**
       * Maximum number of messages to store
       */
      MAX_MESSAGES: 15,

      /**
       * Save a message to local storage
       * @param {string} text - Message content
       * @param {string} sender - Message sender ('user' or 'assistant')
       */
      saveMessage: function(text, sender) {
        try {
          // Get existing messages from local storage
          const existingMessages = this.getMessages();
          
          // Add new message
          existingMessages.push({
            text: text,
            sender: sender,
            timestamp: Date.now(),
            type: 'message'
          });
          
          // Keep only the last MAX_MESSAGES messages
          const messagesToKeep = existingMessages.slice(-this.MAX_MESSAGES);
          
          // Save back to local storage
          localStorage.setItem(this.STORAGE_KEY, JSON.stringify(messagesToKeep));
        } catch (error) {
          console.error('Error saving message to local storage:', error);
        }
      },

      /**
       * Save product results to local storage
       * @param {Array} products - Array of product data objects
       * @param {string} sortType - Optional sort type
       */
      saveProducts: function(products, sortType) {
        try {
          // Get existing messages from local storage
          const existingMessages = this.getMessages();
          
          // Add product data as a special message type
          existingMessages.push({
            type: 'products',
            products: products,
            sortType: sortType,
            timestamp: Date.now()
          });
          
          // Keep only the last MAX_MESSAGES messages
          const messagesToKeep = existingMessages.slice(-this.MAX_MESSAGES);
          
          // Save back to local storage
          localStorage.setItem(this.STORAGE_KEY, JSON.stringify(messagesToKeep));
        } catch (error) {
          console.error('Error saving products to local storage:', error);
        }
      },

      /**
       * Save generated image to local storage
       * @param {string} imageUrl - The generated image URL (base64 or regular URL)
       */
      saveGeneratedImage: function(imageUrl) {
        try {
          // Get existing messages from local storage
          const existingMessages = this.getMessages();
          
          // Add generated image as a special message type
          existingMessages.push({
            type: 'generated_image',
            image_url: imageUrl,
            timestamp: Date.now()
          });
          
          // Keep only the last MAX_MESSAGES messages
          const messagesToKeep = existingMessages.slice(-this.MAX_MESSAGES);
          
          // Save back to local storage
          localStorage.setItem(this.STORAGE_KEY, JSON.stringify(messagesToKeep));
        } catch (error) {
          console.error('Error saving generated image to local storage:', error);
        }
      },

      /**
       * Get all messages from local storage
       * @returns {Array} Array of message objects
       */
      getMessages: function() {
        try {
          const stored = localStorage.getItem(this.STORAGE_KEY);
          if (stored) {
            return JSON.parse(stored);
          }
          return [];
        } catch (error) {
          console.error('Error reading messages from local storage:', error);
          return [];
        }
      },

      /**
       * Clear all messages from local storage
       */
      clearMessages: function() {
        try {
          localStorage.removeItem(this.STORAGE_KEY);
        } catch (error) {
          console.error('Error clearing messages from local storage:', error);
        }
      },

      /**
       * Load messages from local storage and display them
       * @param {HTMLElement} messagesContainer - The messages container
       */
      loadMessages: function(messagesContainer) {
        try {
          const messages = this.getMessages();
          
          if (messages.length === 0) {
            return false; // No messages to load
          }
          
          // Clear the container first (remove any existing messages including welcome message)
          const existingMessages = messagesContainer.querySelectorAll('.shop-ai-message, .shop-ai-product-section, .shop-ai-generated-image-container');
          existingMessages.forEach(msg => {
            msg.remove();
          });
          
          // Add all stored messages (skip saving to storage since we're loading from storage)
          messages.forEach(message => {
            // Check if this is a product message
            if (message.type === 'products' && message.products) {
              // Restore product cards (skip saving to avoid duplicates)
              ShopAIChat.UI.displayProductResults(message.products, message.sortType, true);
            } else if (message.type === 'generated_image' && message.image_url) {
              // Restore generated image (skip saving to avoid duplicates)
              ShopAIChat.UI.displayGeneratedImage(message.image_url, messagesContainer, true);
            } else if (message.type === 'message' || !message.type) {
              // Regular text message (backward compatibility: handle old format without type)
              const messageElement = document.createElement('div');
              messageElement.classList.add('shop-ai-message', message.sender);

              if (message.sender === 'assistant') {
                messageElement.dataset.rawText = message.text;
                ShopAIChat.Formatting.formatMessageContent(messageElement);
              } else {
                messageElement.textContent = message.text;
              }

              messagesContainer.appendChild(messageElement);
            }
          });
          
          // Scroll to bottom
          ShopAIChat.UI.scrollToBottom();
          
          return true; // Messages were loaded
        } catch (error) {
          console.error('Error loading messages from local storage:', error);
          return false;
        }
      }
    },

    /**
     * Initialize the chat application
     */
    init: function() {
      // Initialize UI
      const container = document.querySelector('.shop-ai-chat-container');
      if (!container) return;

      this.UI.init(container);
      
      // Initialize voice recognition if available
      if (window.VoiceHandler) {
        window.VoiceHandler.init();
      }
      
      // Initialize voice recognition
      this.Voice.init();

      // Initialize Try On Modal event listeners
      this.TryOnModal.init();

      // Try to load messages from local storage first
      const messagesLoaded = this.Storage.loadMessages(this.UI.elements.messagesContainer);

      // If no messages in local storage, check for server conversation history
      if (!messagesLoaded) {
        const conversationId = sessionStorage.getItem('shopAiConversationId');

        if (conversationId) {
          // Fetch conversation history from server
          this.API.fetchChatHistory(conversationId, this.UI.elements.messagesContainer);
        } else {
          // No previous conversation, show welcome message
          const welcomeMessage = window.shopChatConfig?.welcomeMessage || "👋 Hi there! How can I help you today?";
          this.Message.add(welcomeMessage, 'assistant', this.UI.elements.messagesContainer);
          
          // Get questions from config (set in Liquid template) or use defaults
          const configQuestions = window.shopChatConfig?.suggestiveQuestions || [];
          const maxQuestions = window.shopChatConfig?.maxSuggestiveQuestions || 4;
          
          // Use questions from config if available, otherwise try to fetch from server
          if (configQuestions && configQuestions.length > 0) {
            const questionsToShow = configQuestions.slice(0, maxQuestions);
            setTimeout(() => {
              ShopAIChat.UI.displaySuggestiveQuestions(questionsToShow, this.UI.elements.messagesContainer);
            }, 100);
          } else {
            // Fallback: use default questions if config doesn't have any
            const defaultQuestions = [
              "Hello, how are you?",
              "What is this store about?",
              "Hey, please show me some products",
              "What are your best sellers?"
            ];
            
            setTimeout(() => {
              ShopAIChat.UI.displaySuggestiveQuestions(defaultQuestions.slice(0, maxQuestions), this.UI.elements.messagesContainer);
              
              // Try to fetch from server as backup
              this.API.fetchSuggestiveQuestions(this.UI.elements.messagesContainer);
            }, 100);
          }
        }
      }
    }
  };

  // Initialize the application when DOM is ready
  document.addEventListener('DOMContentLoaded', function() {
    ShopAIChat.init();
  });
})();
