from flask import Blueprint, request, jsonify
from helpers.cors_helpers import pre_authorized_cors_preflight
from services.chat_service import process_chat

chat_bp = Blueprint("chat", __name__)

# Update to current model version
model = "gpt-3.5-turbo"  # or your preferred model

def validate_model_version():
    """Validate that the model version is supported."""
    supported_models = ["gpt-3.5-turbo", "gpt-4"]
    if model not in supported_models:
        raise ValueError(f"Unsupported model version. Please use one of: {', '.join(supported_models)}")

@pre_authorized_cors_preflight
@chat_bp.route("/chat", methods=["POST"])
def chat():
    """Handle chat messages from users."""
    try:
        data = request.get_json(force=True)
        print("DEBUG: Received request JSON:", data)

        if not data:
            return jsonify({"error": "Missing JSON body"}), 400

        # Validate model version
        validate_model_version()

        # Get the user message and conversation history
        user_message = data.get("message", "").strip()
        if not user_message:
            return jsonify({"error": "Message cannot be empty"}), 400

        conversation_history = data.get("conversation_history", [])
        if not isinstance(conversation_history, list):
            return jsonify({"error": "Conversation history must be a list"}), 400
        
        print("DEBUG: Initial conversation history:", conversation_history)

        # Process the chat message
        result, status_code = process_chat(user_message, conversation_history)
        return jsonify(result), status_code

    except ValueError as ve:
        print("DEBUG: Validation error:", str(ve))
        return jsonify({"error": str(ve)}), 400
    except Exception as e:
        print("DEBUG: Exception encountered:", e)
        import traceback
        traceback.print_exc()
        return jsonify({"error": "An unexpected error occurred. Please try again later."}), 500

@pre_authorized_cors_preflight
@chat_bp.route("/tool-call-result", methods=["POST"])
def tool_call_result():
    """Handle tool call results."""
    try:
        data = request.get_json(force=True)
        print("DEBUG: Received tool call result request JSON:", data)

        if not data:
            return jsonify({"error": "Missing JSON body"}), 400

        # Get the conversation history
        conversation_history = data.get("conversation_history", [])
        
        # Process the tool call
        #result, status_code = process_tool_call(conversation_history)
        #return jsonify(result), status_code
        return 200
    
    except Exception as e:
        print("DEBUG: Exception encountered in tool call result:", e)
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500
