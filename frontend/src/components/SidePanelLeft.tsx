import {
    Card,
    CardHeader,
    CardBody,
    Image,
    Spacer,
    Link,
    Button,
} from "@heroui/react";
import { useEffect } from "react";

export const SidePanelLeft = () => {
    useEffect(() => {
        resetChat();
    }, []);
    
    const resetChat = async () => {
        try {
            const response = await fetch("http://127.0.0.1:5000/reset-memory", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            console.log("Memory reset successfully.");
        } catch (error) {
        }
    };

    return (
        <div className="flex flex-col h-screen w-1/6 shadow-xl pb-14">
            <Spacer y={4}/>
            <Image alt="heroui logo" src="/logo.png" className="rounded-none"/>
            <div className="flex flex-col justify-between h-full pr-5 pl-5 pb-20">
                <Card className="rounded-none shadow-none">
                    <CardHeader className="flex gap-3 rounded-none">
                        <h1 className="text-3xl">Documentation</h1>
                    </CardHeader>
                    <CardBody className="overflow-hidden pl-0 pr-0">
                        <ul className="flex flex-col">
                            <li className="hover:bg-yellow  w-full">
                                <Link
                                    href={"/learning"}
                                    isBlock
                                    color={undefined}
                                    className="text-color-darkblue font-semibold text-xl h-12 ml-5"
                                >
                                    L'entraînement
                                </Link>
                            </li>
                            <li className="hover:bg-yellow  w-full">
                                <Link
                                    href="#"
                                    isBlock
                                    color={undefined}
                                    className="text-color-darkblue font-semibold text-xl h-12 ml-5"
                                >
                                    Les biais
                                </Link>
                            </li>
                            <li className="hover:bg-yellow  w-full">
                                <Link
                                    href="#"
                                    isBlock
                                    color={undefined}
                                    className="text-color-darkblue font-semibold text-xl w-full h-12 ml-5"
                                >
                                    La véracité
                                </Link>
                            </li>
                            <li className="hover:bg-yellow  w-full">
                                <Link
                                    href="#"
                                    isBlock
                                    color={undefined}
                                    className="text-color-darkblue font-semibold text-xl w-full h-12 ml-5"
                                >
                                    Les mathématiques
                                </Link>
                            </li>
                            <li className="hover:bg-yellow  w-full">
                                <Link
                                    href="#"
                                    isBlock
                                    color={undefined}
                                    className="text-color-darkblue font-semibold text-xl w-full h-12 ml-5"
                                >
                                    L'espace vectoriel
                                </Link>
                            </li>
                        </ul>
                    </CardBody>
                </Card>
                <Button
                    className="pr-5 pl-5 hover:bg-yellow  text-white font-semibold  text-lg"
                    color="primary"
                    radius="none"
                    size="lg"
                    onPress={() => {
                        resetChat();
                        window.location.href = "/"
                    }}
                >
                    Nouvelle conversation
                </Button>
            </div>
        </div>
    );
};
