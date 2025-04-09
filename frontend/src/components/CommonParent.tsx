import {BrowserRouter as Router, Route, Routes} from "react-router-dom";
import {SidePanelLeft} from "@/components/SidePanelLeft.tsx";
import {SidePanelRight} from "@/components/SidePanelRight.tsx";
import {DialogBox} from "@/components/DialogBox.tsx";
import {Learning} from "@/pages/learning.tsx";
import { History } from "@/pages/history.tsx";
import { ApiService } from "../services/ApiService";
import { useState, useEffect } from "react";

// Définition du type de message pour le partage entre les composants
export type TokenData = {
    token: string;
    probabilities: { token: string; probability: number }[];
};

export type Message = {
    tokens: TokenData[];
    isUser: boolean;
};

export const CommonParent = () => {
    const [showTokenBorders, setShowTokenBorders] = useState(false);
    const [showTokenPopovers, setShowTokenPopovers] = useState(false);
    
    // États partagés entre CommonParent et DialogBox
    const [messages, setMessages] = useState<Message[]>([]);
    const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
    const [currentProfileId, setCurrentProfileId] = useState<string | null>(null);

    // Récupérer le profil initial
    useEffect(() => {
        const fetchCurrentProfile = async () => {
            try {
                if (currentProfileId === null) {
                    const profile = await ApiService.getCurrentProfile();
                    if (profile) {
                        console.log("Setting current profile from CommonParent:", profile.id);
                        setCurrentProfileId(profile.id);
                    }
                }
            } catch (error) {
                console.error("Erreur lors du chargement du profil initial:", error);
            }
        };

        fetchCurrentProfile();
    }, []);

    const resetChat = () => {
        setMessages([]);
        setCurrentConversationId(null);
    };

    const resetChatWithProfil = async (profileId: string) => {
        try {
            await ApiService.resetMemory(profileId);
            resetChat();
            setCurrentProfileId(profileId);
        } catch (error) {
            console.error("Erreur lors de la réinitialisation du chat:", error);
        }
    };

    const callResetChat = async () => {
        try {
            await ApiService.resetMemory(currentProfileId || undefined);
            resetChat();
        } catch (error) {
            console.error("Erreur lors de la réinitialisation du chat:", error);
        }
    };

    return (
        <Router>
            <div className="flex w-full h-screen overflow-hidden">
                <SidePanelLeft callResetChat={callResetChat}/>
                <Routes>
                    <Route
                        path="/"
                        element={
                            <>
                                <DialogBox
                                    showTokenBorders={showTokenBorders}
                                    showTokenPopovers={showTokenPopovers}
                                    messages={messages}
                                    setMessages={setMessages}
                                    currentConversationId={currentConversationId}
                                    setCurrentConversationId={setCurrentConversationId}
                                    currentProfileId={currentProfileId}
                                />
                                <SidePanelRight
                                    setShowTokenBorders={setShowTokenBorders}
                                    setShowTokenPopovers={setShowTokenPopovers}
                                    showTokenBorders={showTokenBorders}
                                    showTokenPopovers={showTokenPopovers}
                                    changeProfile={resetChatWithProfil}
                                />
                            </>
                        }
                    />
                    <Route path="/learning" element={<Learning/>}/>
                    <Route path="/biais" element={<Learning/>}/>
                    <Route path="/veracite" element={<Learning/>}/>
                    <Route path="/mathematiques" element={<Learning/>}/>
                    <Route path="/espace-vectoriel" element={<Learning/>}/>
                    <Route path="/history" element={<History/>}/>
                </Routes>
            </div>
        </Router>
    );
};
