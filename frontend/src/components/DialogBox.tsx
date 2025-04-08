import React, { useEffect, useState, useRef, forwardRef, useImperativeHandle } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import {
    Textarea,
    Button,
    Spinner,
    ScrollShadow,
    Popover,
    PopoverTrigger,
    PopoverContent,
    Table,
    TableHeader,
    TableColumn,
    TableBody,
    TableRow,
    TableCell
} from "@heroui/react";
import { useLocation } from "react-router-dom";
import { ApiService, CurrentProfile } from "../services/ApiService";

type TokenData = {
    token: string;
    probabilities: { token: string; probability: number }[];
};

type Message = {
    tokens: TokenData[];
    isUser: boolean;
};

// Composant pour afficher un token avec ses probabilités
const TokenWithPopover = ({
    tokenData,
    showTokenBorders,
    showTokenPopovers,
}: {
    tokenData: TokenData;
    showTokenBorders: boolean;
    showTokenPopovers: boolean;
}) => {
    const [isOpen, setIsOpen] = useState(false);

    const handleClick = () => {
        if (showTokenPopovers) {
            setIsOpen(true);
        }
    };

    return (
        <Popover isOpen={isOpen} onOpenChange={setIsOpen} className={"w-1/2"}>
            <PopoverTrigger>
                <span
                    className={`cursor-pointer p-0.5 ${
                        showTokenBorders ? "border-blue border-solid border-1" : ""
                    }`}
                    onClick={handleClick}
                >
                    {tokenData.token}
                </span>
            </PopoverTrigger>
            {showTokenPopovers && (
                <PopoverContent>
                    <div className="p-4">
                        <h3 className="text-lg font-semibold">Token Probabilities</h3>
                        <Table aria-label="Token Probabilities">
                            <TableHeader>
                                <TableColumn>Token</TableColumn>
                                <TableColumn>Probability</TableColumn>
                            </TableHeader>
                            <TableBody>
                                {tokenData.probabilities.map((prob, index) => (
                                    <TableRow key={index}>
                                        <TableCell>{prob.token}</TableCell>
                                        <TableCell>{(prob.probability * 100).toFixed(2)}%</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                        <p className="mt-2 text-sm text-gray-600">
                            The AI selects tokens based on probability distributions
                            calculated from the context and training data. Higher probability
                            tokens are more likely to be chosen.
                        </p>
                    </div>
                </PopoverContent>
            )}
        </Popover>
    );
};

type DialogBoxProps = {
    showTokenBorders: boolean;
    showTokenPopovers: boolean;
};

// Composant principal
export const DialogBox = forwardRef<{ resetChatComponent: () => void }, DialogBoxProps>(
    ({ showTokenBorders, showTokenPopovers }, ref) => {
    // États
    const [message, setMessage] = useState("");
    const [messages, setMessages] = useState<Message[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
    const [currentProfile, setCurrentProfile] = useState<CurrentProfile | null>(null);

    // Refs et autres variables
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const location = useLocation();
    const preprompt = "";

    // Exposer les méthodes via forwardRef
    useImperativeHandle(ref, () => ({
        resetChatComponent: () => {
            setMessages([]);
            setCurrentConversationId(null);
        }
    }));
    // Effets
    // 1. Charger le profil actuel
    useEffect(() => {
        const fetchCurrentProfile = async () => {
            try {
                const profile = await ApiService.getCurrentProfile();
                if (profile) {
                    setCurrentProfile(profile);
                }
            } catch (err) {
                console.error("Erreur lors du chargement du profil:", err);
            }
        };

        fetchCurrentProfile();
    }, []);

    // 2. Charger une conversation existante si spécifiée dans l'URL
    useEffect(() => {
        const queryParams = new URLSearchParams(location.search);
        const conversationId = queryParams.get("conversation");

        if (conversationId) {
            loadConversation(conversationId);
        }
    }, [location.search]);

    // 3. Scroll vers le bas à chaque nouveau message
    useEffect(() => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
        }
    }, [messages]);

    // Fonctions
    const loadConversation = async (conversationId: string) => {
        try {
            setIsLoading(true);
            const data = await ApiService.getConversation(conversationId);

            setCurrentConversationId(conversationId);

            // Mise à jour du profil si présent dans les métadonnées
            if (data.metadata && data.metadata.profile_id) {
                setCurrentProfile({
                    id: data.metadata.profile_id,
                    name: data.metadata.profile_name || "Profil inconnu"
                });
            }

            // Convertir les messages du format backend vers le format frontend
            const convertedMessages: Message[] = [];

            data.messages?.forEach((msg: any) => {
                if (msg.role !== "system") {
                    convertedMessages.push({
                        tokens: [{token: msg.content, probabilities: []}],
                        isUser: msg.role === "user"
                    });
                }
            });

            setMessages(convertedMessages);
        } catch (error) {
            console.error("Erreur lors du chargement de la conversation:", error);
        } finally {
            setIsLoading(false);
        }
    };

    const onEnterPress = (e: { keyCode: number; shiftKey: any; preventDefault: () => void; }) => {
        if (e.keyCode === 13 && !e.shiftKey) {
            e.preventDefault();
            submitMessage();
        }
    };

    const submitMessage = async () => {
        if (message.trim() === "") return;

        // Message original de l'utilisateur
        const enrichedMessage = preprompt ? `${preprompt}\n\n${message}` : message;
        const userMessage: Message = {tokens: [{token: message, probabilities: []}], isUser: true};
        
        setMessages((prevMessages) => [...prevMessages, userMessage]);
        setMessage("");
        setIsLoading(true);

        try {
            const response = await ApiService.sendMessage(
                enrichedMessage,
                "mistral",
                currentConversationId || undefined,
                currentProfile?.id
            );

            if (!response.body) throw new Error("No response body");

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let botTokens: TokenData[] = [];

            setIsLoading(false);

            while (true) {
                const {done, value} = await reader.read();
                if (done) break;

                let chunk = decoder.decode(value, {stream: true});
                chunk = chunk.replace(/<\/s>$/g, ""); // Remove </s> at the end of the message
                
                // Gestion flexible des formats de réponse
                try {
                    // Format SSE standard (data: {...})
                    if (chunk.includes("data: ")) {
                        chunk.split("\n\n").forEach((event) => {
                            if (event.startsWith("data: ")) {
                                const jsonData = JSON.parse(event.replace("data: ", "").trim());
                                if (jsonData.error) throw new Error(jsonData.error);

                                botTokens.push({token: jsonData.token, probabilities: jsonData.probabilities || []});
                            }
                        });
                    } 
                    // Stream de données brut (peut être JSON ou texte)
                    else {
                        try {
                            // Essayer de parser comme JSON
                            const jsonData = JSON.parse(chunk);
                            if (jsonData.error) throw new Error(jsonData.error);
                            
                            // Si c'est un objet avec token
                            if (jsonData.token) {
                                botTokens.push({token: jsonData.token, probabilities: jsonData.probabilities || []});
                            } 
                            // Si c'est un objet sans token mais avec du texte
                            else if (jsonData.text || jsonData.content) {
                                botTokens.push({token: jsonData.text || jsonData.content, probabilities: []});
                            }
                        } catch (e) {
                            // Si ce n'est pas du JSON valide, considérer comme du texte brut
                            botTokens.push({token: chunk, probabilities: []});
                        }
                    }
                    
                    // Mettre à jour les messages avec les nouveaux tokens
                    setMessages((prevMessages) => {
                        const updatedMessages = [...prevMessages];
                        if (updatedMessages.length > 0 && !updatedMessages[updatedMessages.length - 1].isUser) {
                            updatedMessages[updatedMessages.length - 1].tokens = [...botTokens];
                        } else {
                            updatedMessages.push({tokens: [...botTokens], isUser: false});
                        }
                        return updatedMessages;
                    });
                    
                } catch (error) {
                    console.error("Error parsing stream chunk:", error, "Chunk:", chunk);
                }
            }

            // Si c'est une nouvelle conversation, récupérer l'ID attribué
            if (!currentConversationId) {
                try {
                    const data = await ApiService.resetMemory(currentProfile?.id);
                    setCurrentConversationId(data.conversation_id);

                    if (data.profile) {
                        setCurrentProfile(data.profile);
                    }
                } catch (error) {
                    console.error("Erreur lors de la récupération de l'ID de conversation:", error);
                }
            }
        } catch (error) {
            console.error("Stream error:", error);
            setMessages((prevMessages) => [
                ...prevMessages,
                {
                    tokens: [{token: "Error fetching response.", probabilities: []}],
                    isUser: false,
                },
            ]);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex flex-col w-2/3 justify-end content-around pt-4 pb-4 gap-2">
            {/* En-tête avec l'ID de conversation et le profil */}
            {currentConversationId && (
                <div className="px-10 mb-2">
                    <div className="bg-blue-50 text-blue-700 py-2 px-3 rounded-md text-sm flex justify-between items-center">
                        <span>Conversation en cours: {currentConversationId}</span>
                        {currentProfile && (
                            <span className="bg-green-100 text-green-700 px-2 py-1 rounded text-xs">
                                Profil: {currentProfile.name}
                            </span>
                        )}
                    </div>
                </div>
            )}

            {/* Zone des messages */}
            <ScrollShadow className="w-full h-full flex flex-col items-center pl-10 pr-10 gap-4">
                {messages.map((msg, index) => (
                    <div key={index} className={`flex w-full ${msg.isUser ? "justify-end" : "justify-start"}`}>
                        <div
                            className={`max-w-xl p-3 rounded-lg break-words ${msg.isUser ? "bg-primary text-white" : "bg-gray-200 text-black"}`}>
                            {!showTokenBorders && !showTokenPopovers ? (
                                // Render only the complete Markdown text if available
                                <div className="prose prose-sm max-w-none mt-2">
                                    <ReactMarkdown
                                        remarkPlugins={[remarkGfm, remarkMath]}
                                        rehypePlugins={[rehypeRaw, rehypeKatex]}
                                    >
                                        {msg.tokens.map((token) => token.token).join(" ")}
                                    </ReactMarkdown>
                                </div>
                            ) : (
                                // Otherwise, fall back to rendering token-by-token if msg.text is not present
                                msg.tokens.map((tokenData, idx) => (
                                    <TokenWithPopover
                                        key={idx}
                                        tokenData={tokenData}
                                        showTokenBorders={showTokenBorders}
                                        showTokenPopovers={showTokenPopovers}
                                    />
                                ))
                            )}
                        </div>
                    </div>
                ))}

                {/* Indicateur de chargement */}
                {isLoading && (
                    <div className="flex w-full justify-start">
                        <div className="flex items-center gap-2 p-3 rounded-lg bg-gray-200">
                            <Spinner size="sm" color="primary"/>
                            <span className="text-sm text-gray-600">Terra NumerIA réfléchit...</span>
                        </div>
                    </div>
                )}

                {/* Référence pour le défilement automatique */}
                <div ref={messagesEndRef} />
            </ScrollShadow>

            {/* Zone de saisie et bouton d'envoi */}
            <div className="w-full h-2/10 flex justify-center">
                <div className="bottom-4 left-1/2 w-2/3">
                    <div className="flex flex-row items-center gap-2">
                        <Textarea
                            className="w-full h-20"
                            placeholder="Entrez votre message..."
                            radius="none"
                            variant="flat"
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            onKeyDown={onEnterPress}
                            isDisabled={isLoading}
                        />
                        <Button
                            className="size-20 hover:bg-yellow"
                            color="primary"
                            radius="none"
                            onPress={submitMessage}
                            isDisabled={isLoading}
                            isLoading={isLoading}
                        >
                            Envoyer
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
});
