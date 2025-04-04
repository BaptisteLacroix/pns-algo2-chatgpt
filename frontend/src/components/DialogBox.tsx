import { Textarea, Button, ScrollShadow } from "@heroui/react";
import { useEffect, useState, useRef } from "react";

type Message = {
    text: string;
    isUser: boolean;
};
export const DialogBox = () => {
    const [message, setMessage] = useState("");
    const [messages, setMessages] = useState<Message[]>([]);
    const messagesEndRef = useRef<HTMLDivElement>(null);


    const onEnterPress = (e: {
        keyCode: number;
        shiftKey: any;
        preventDefault: () => void;
    }) => {
        if (e.keyCode === 13 && !e.shiftKey) {
            e.preventDefault();
            submitMessage();
        }
    };

    const submitMessage = async () => {
        if (message.trim() === "") return;
        const userMessage: Message = { text: message, isUser: true };
        setMessages((prevMessages) => [...prevMessages, userMessage]);
        setMessage("");

        try {
            const response = await fetch("http://127.0.0.1:5000/responses", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    prompt: message,
                    model: "mistral",
                }),
            });

            if (!response.body) throw new Error("No response body");

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let botMessage = "";

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                botMessage += decoder.decode(value, { stream: true });
                botMessage = botMessage.replace(/<\/s>$/g, ""); // Remove </s> at the end of the message
                setMessages((prevMessages) => {
                    const updatedMessages = [...prevMessages];
                    if (
                        updatedMessages.length > 0 &&
                        !updatedMessages[updatedMessages.length - 1].isUser
                    ) {
                        updatedMessages[updatedMessages.length - 1].text =
                            botMessage;
                    } else {
                        updatedMessages.push({
                            text: botMessage,
                            isUser: false,
                        });
                    }
                    return [...updatedMessages];
                });
            }
        } catch (error) {
            console.error("Stream error:", error);
            setMessages((prevMessages) => [
                ...prevMessages,
                { text: "Error fetching response.", isUser: false },
            ]);
        }
    };

    useEffect(() => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
        }
    }, [messages]);

    return (
        <div className="flex flex-col w-2/3 justify-end content-around pt-4 pb-4 gap-2">
            <ScrollShadow className="w-full h-full flex flex-col items-center pl-10 pr-10 gap-4">
                {messages.map((msg, index) => (
                    <div
                        key={index}
                        className={`flex w-full ${msg.isUser ? "justify-end" : "justify-start"}`}
                    >
                        <div
                            className={`max-w-xl p-3 rounded-lg break-words ${msg.isUser ? "bg-primary text-white" : "bg-gray-200 text-black"}`}
                        >
                            {msg.text}
                        </div>
                    </div>
                ))}
                <div ref={messagesEndRef} />
            </ScrollShadow>
            <div className="w-full h-2/10 flex justify-center">
                <div className="bottom-4 left-1/2 w-2/3">
                    <div className={"flex flex-row items-center gap-2"}>
                        <Textarea
                            className="w-full h-20"
                            placeholder="Enter your message"
                            radius="none"
                            variant="flat"
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            onKeyDown={onEnterPress}
                        />
                        <Button
                            className="size-20 hover:bg-yellow"
                            color="primary"
                            radius="none"
                            onPress={submitMessage}
                        >
                            Envoyer
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
};
