export const resetChat = async (profil:string) => {
    try {
        const response = await fetch("http://127.0.0.1:5000/reset-memory", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                profil: profil,
            }),
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        console.log("Memory reset successfully.");
    } catch (error) {
    }
};

export const changeProfil = (profil: string) => {
    localStorage.setItem('chosenProfil', profil);
    resetChat(profil);
    console.log("Profil changed to: " + profil);
};

export const getProfil = () => {
    const storedProfil = localStorage.getItem('chosenProfil');
    if (storedProfil) {
        return storedProfil;
    }
    return 'TNIA';
}