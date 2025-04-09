// Types
import { makeRequest } from './HttpService';
import { CacheService, Profile, CurrentProfile } from './CacheService';

export type { Profile, CurrentProfile };

export type Message = {
    role: string;
    content: string;
};

export type Conversation = {
    id: string;
    timestamp: string;
    preview: string;
    date?: string;
    messages?: Message[];
    metadata?: {
        profile_id?: string;
        profile_name?: string;
    };
};

// Services d'API
export const ApiService = {
    // Conversations
    getConversations: async (): Promise<Conversation[]> => {
        const data = await makeRequest<{conversations: any[]}>("/conversations");
        
        // Formater les dates
        return data.conversations.map((conv: any) => ({
            ...conv,
            date: new Date(conv.timestamp).toLocaleDateString('fr-FR', {
                day: 'numeric',
                month: 'long',
                year: 'numeric'
            })
        }));
    },

    getConversation: async (id: string): Promise<Conversation> => {
        return makeRequest<Conversation>(
            `/conversations/${id}`, 
            {}, 
            "Impossible de charger cette conversation"
        );
    },

    deleteConversation: async (id: string): Promise<void> => {
        await makeRequest(
            `/conversations/${id}`, 
            { method: "DELETE" }, 
            "Erreur lors de la suppression"
        );
    },

    // Réponses et messages
    sendMessage: async (prompt: string, model: string = "mistral", conversationId?: string, profileId?: string) => {
        const requestBody: Record<string, any> = { prompt, model };
        
        if (conversationId) {
            requestBody.conversation_id = conversationId;
        }
        
        if (profileId && !conversationId) {
            requestBody.profile_id = profileId;
        }
        
        return makeRequest<Response>(
            "/responses", 
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(requestBody),
            },
            "Erreur lors de l'envoi du message"
        );
    },

    // Profils - utilise maintenant le CacheService
    getAllProfiles: async (): Promise<Record<string, Profile>> => {
        return CacheService.getProfiles();
    },

    getCurrentProfile: async (): Promise<CurrentProfile | null> => {
        return CacheService.getCurrentProfile();
    },

    changeProfile: async (profileId: string): Promise<{ profile: CurrentProfile, conversation_id?: string }> => {
        const data = await makeRequest<{ profile: CurrentProfile, conversation_id?: string }>(
            "/profiles/change", 
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ profile_id: profileId }),
            },
            "Erreur lors du changement de profil"
        );
        
        if (data.profile) {
            CacheService.updateCurrentProfile(data.profile);
        }
        
        return data;
    },

    // Gestion de la mémoire/conversation
    resetMemory: async (profileId?: string): Promise<{ conversation_id: string, profile?: CurrentProfile }> => {
        const requestBody: Record<string, any> = {};
        if (profileId) {
            requestBody.profile_id = profileId;
        }
        
        const data = await makeRequest<{ conversation_id: string, profile?: CurrentProfile }>(
            "/reset-memory", 
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(requestBody),
            },
            "Erreur lors de la réinitialisation"
        );
        
        if (data.profile) {
            CacheService.updateCurrentProfile(data.profile);
        }
        
        CacheService.clearCache();
        
        return data;
    }
};