from threading import Thread
import logging
import json
import time
import queue as _queue

import torch
from huggingface_hub import login
from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig, TextIteratorStreamer

from env import HF_TOKEN
from env import CACHE_DIR
from conversation_manager import ConversationManager
from profiles import get_profile_content

logger = logging.getLogger("FlaskAppLogger")


class Model:
    MODELS = {
        "mistral": "Faradaylab/ARIA-7B-V3-mistral-french-v1",
    }

    @property
    def current_conversation_id(self):
        return self._current_conversation_id

    @current_conversation_id.setter
    def current_conversation_id(self, conversation_id):
        self._current_conversation_id = conversation_id

    def __init__(self, model_chosen, profile_id="default"):
        # Check if GPU is available
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        print(f"📌 Using device: {self.device}")
        self.model_name = self.check_and_load_model_name(model_chosen)
        self.tokenizer = None
        # self.login_hugging_face()
        self.ai_model = self.load_model()
        if self.tokenizer is not None and self.ai_model is not None:
            print(f"✅ Model {self.model_name} loaded successfully")
        else:
            print("❌ Error loading model or tokenizer")

        # Chargement du profil sélectionné
        self.profile_id = profile_id
        self.load_profile(profile_id)

        self.conversation_manager = ConversationManager()
        self._current_conversation_id = self.conversation_manager.generate_conversation_id()

    def load_profile(self, profile_id):
        """Charge un profil spécifique pour l'IA"""
        profile = get_profile_content(profile_id)
        self.profile_id = profile_id
        self.profile_name = profile["name"]

        # Initialisation de l'historique avec le prompt système du profil
        self.chat_history = [{"role": "system", "content": profile["system_prompt"]}]
        logger.info(f"Profil chargé: {self.profile_name} (ID: {self.profile_id})")

        return True

    def change_profile(self, profile_id):
        """Change le profil de l'IA et réinitialise l'historique"""
        success = self.load_profile(profile_id)
        if success:
            # Génère un nouveau conversation ID pour cette nouvelle session avec profil différent
            self._current_conversation_id = self.conversation_manager.generate_conversation_id()
            return True
        return False

    @staticmethod
    def login_hugging_face():
        # Login to Hugging Face
        try:
            login(token=HF_TOKEN)
            print("✅ Successfully logged in to Hugging Face")
        except Exception as e:
            print(f"⚠️ Error logging in to Hugging Face: {e}")

    @staticmethod
    def check_and_load_model_name(model_chosen):
        if model_chosen in Model.MODELS:
            return Model.MODELS.get(model_chosen)

    def load_model(self):
        # Load tokenizer and model (loading them globally for reuse)
        try:
            print(f"🔄 Loading tokenizer for {self.model_name}...")
            self.tokenizer = AutoTokenizer.from_pretrained(self.model_name, cache_dir=CACHE_DIR)
            self.tokenizer.pad_token = self.tokenizer.eos_token  # Set pad token

            print(f"🔄 Loading model {self.model_name}...")

            device_map = {"": 0}  # Map all modules to GPU 0 by default

            quantization_config = BitsAndBytesConfig(
                load_in_4bit=True,
                bnb_4bit_compute_dtype=torch.float16,
                bnb_4bit_use_double_quant=False,
                bnb_4bit_quant_type="nf4",
                llm_int8_enable_fp32_cpu_offload=True  # Enable CPU offloading for modules that don't fit in GPU
            )

            model = AutoModelForCausalLM.from_pretrained(
                self.model_name,
                device_map=device_map,  # Use custom device map
                quantization_config=quantization_config,
                torch_dtype=torch.float16,
                cache_dir=CACHE_DIR,
                offload_folder="offload",  # Specify a folder for disk offloading
                offload_state_dict=True,   # Enable state dict offloading to save GPU memory
                low_cpu_mem_usage=True     # Optimize CPU memory usage
            )

            return model
        except Exception as e:
            print(f"❌ Error loading model or tokenizer: {e}")

    def generate_response_stream(self, prompt):
        """
        Generate streaming response from the language model
        """
        import json
        import traceback
        import time
        import queue as _queue

        if self.ai_model is None or self.tokenizer is None:
            json_error = json.dumps({"error": "Model not loaded correctly."})
            yield f"data: {json_error}\n\n"
            return

        try:
            # format the prompt
            formatted_prompt = self.format_prompt(prompt)

            # Prepare input
            tokenized_inputs = self.tokenizer(formatted_prompt, return_tensors="pt").to(self.device)

            # Setup streamer
            streamer = TextIteratorStreamer(self.tokenizer, skip_prompt=True, timeout=90.0)

            # Create generation config
            generation_kwargs = dict(
                inputs=tokenized_inputs["input_ids"],
                attention_mask=tokenized_inputs["attention_mask"],
                max_new_tokens=512,
                temperature=0.7,
                top_p=0.95,
                do_sample=True,
                streamer=streamer
            )

            # Start generation in a separate thread
            generation_thread = Thread(target=self.ai_model.generate, kwargs=generation_kwargs)
            generation_thread.daemon = True  # Make the thread daemon so it doesn't block process exit
            generation_thread.start()

            # Wait for generation to actually start before yielding
            time.sleep(0.5)

            response_text = ""
            try:
                for chunk in streamer:
                    response_text += chunk
                    # Format the chunk as a JSON object with token and empty probabilities
                    json_chunk = json.dumps({"token": chunk, "probabilities": []})
                    yield f"data: {json_chunk}\n\n"
            except _queue.Empty:
                logger.warning("Streamer queue empty, generation may have stalled")
                if response_text:
                    error_msg = json.dumps({"token": "\n\n[Generation timed out, but partial response retrieved]", "probabilities": []})
                    yield f"data: {error_msg}\n\n"
                else:
                    error_msg = json.dumps({"token": "Désolé, la génération de réponse a pris trop de temps. Veuillez réessayer.", "probabilities": []})
                    yield f"data: {error_msg}\n\n"

            if response_text:
                self.chat_history.append({"role": "assistant", "content": response_text})

                # Sauvegarde de la conversation après chaque réponse
                self.conversation_manager.save_conversation(self.current_conversation_id, self.chat_history)

        except Exception as e:
            import traceback
            error_traceback = traceback.format_exc()
            logger.error(f"Model generation error: {str(e)}\n{error_traceback}")
            error_msg = json.dumps({"error": str(e), "token": f"Error generating response: {str(e)}", "probabilities": []})
            yield f"data: {error_msg}\n\n"

    def format_prompt(self, prompt):
        """
        Construit le prompt en intégrant l'historique sous la forme :
        <|user|>
        Question</s>
        <|assistant|>
        Réponse</s>
        """
        self.chat_history.append({"role": "user", "content": prompt})

        # Construire le prompt formaté
        formatted_prompt = ""
        for entry in self.chat_history:
            role_tag = "<|" + entry["role"] + "|>"
            formatted_prompt += f"{role_tag}\n{entry['content']}</s>\n"
        formatted_prompt += "<|assistant|>\n" #TODO changer le nom assitant pour un meilleur role play
        return formatted_prompt

    def reset_memory(self):
        """Réinitialise l'historique de conversation en conservant uniquement le prompt système."""
        # Sauvegarde du prompt système avant de réinitialiser
        system_prompt = None
        for msg in self.chat_history:
            if msg.get("role") == "system":
                system_prompt = msg
                break

        # Réinitialisation de l'historique
        if system_prompt:
            self.chat_history = [system_prompt]
        else:
            # Si aucun prompt système n'est trouvé, recharge le profil actuel
            self.load_profile(self.profile_id)

        # Génère un nouveau ID de conversation
        self._current_conversation_id = self.conversation_manager.generate_conversation_id()
        
    def load_conversation_history(self, conversation_id):
        """Charge une conversation existante."""
        conversation_data = self.conversation_manager.load_conversation(conversation_id)
        if conversation_data:
            self.chat_history = conversation_data.get("messages", [])
            self._current_conversation_id = conversation_id

            # Vérifie si le profil utilisé est spécifié dans les métadonnées
            metadata = conversation_data.get("metadata", {})
            if "profile_id" in metadata:
                self.profile_id = metadata.get("profile_id")
                self.profile_name = get_profile_content(self.profile_id)["name"]

            return True
        return False
