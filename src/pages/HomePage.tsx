import React from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

const HomePage: React.FC = () => {
  const navigate = useNavigate();

  const handleGoLive = () => {
    navigate("/live?broadcaster=true");
  };

  return (
    <div className="h-screen flex flex-col items-center justify-center">
      <div className="w-full max-w-md p-6 bg-white rounded-lg shadow-md">
        <h2 className="text-2xl font-bold mb-4">Start Streaming</h2>
        <p className="mb-6">
          Click the button below to start broadcasting from your browser.
          Viewers can watch your stream at /live.
        </p>
        <Button
          onClick={handleGoLive}
          className="w-full  font-bold py-2 px-4 rounded"
        >
          Go Live
        </Button>
      </div>
    </div>
  );
};

export default HomePage;
