import React, { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";

const LivePage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const isBroadcaster = searchParams.get("broadcaster") === "true";

  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLive, setIsLive] = useState(false);
  const [hasCamera, setHasCamera] = useState(false);
  const [hasMic, setHasMic] = useState(false);

  const toggleCamera = async () => {
    if (hasCamera) {
      if (stream) {
        const videoTracks = stream.getVideoTracks();
        videoTracks.forEach((track) => {
          track.stop();
          stream.removeTrack(track);
        });

        if (videoRef.current) {
          if (stream.getTracks().length > 0) {
            videoRef.current.srcObject = stream;
          } else {
            videoRef.current.srcObject = null;
            setStream(null);
          }
        }
      }
      setHasCamera(false);
    } else {
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });

        if (stream) {
          mediaStream.getVideoTracks().forEach((track) => {
            stream.addTrack(track);
          });

          if (videoRef.current) {
            videoRef.current.srcObject = stream;
          }
        } else {
          setStream(mediaStream);

          if (videoRef.current) {
            videoRef.current.srcObject = mediaStream;
          }
        }
        setHasCamera(true);
      } catch (err) {
        console.error("Error accessing camera:", err);
        setError("Could not access camera");
      }
    }
  };

  const toggleMicrophone = async () => {
    if (hasMic) {
      if (stream) {
        const audioTracks = stream.getAudioTracks();
        audioTracks.forEach((track) => {
          track.stop();
          stream.removeTrack(track);
        });
      }
      setHasMic(false);
    } else {
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: false,
          audio: true,
        });

        if (stream) {
          mediaStream.getAudioTracks().forEach((track) => {
            stream.addTrack(track);
          });
        } else {
          setStream(mediaStream);
        }
        setHasMic(true);
      } catch (err) {
        console.error("Error accessing microphone:", err);
        setError("Could not access microphone");
      }
    }
  };

  const handleGoLive = () => {
    if (!isLive) {
      console.log("Starting broadcast...");
      setIsLive(true);
    } else {
      console.log("Ending broadcast...");
      setIsLive(false);

      if (stream) {
        stream.getTracks().forEach((track) => {
          track.stop();
        });
        setStream(null);

        if (videoRef.current) {
          videoRef.current.srcObject = null;
        }

        setHasCamera(false);
        setHasMic(false);
      }
    }
  };

  if (isBroadcaster) {
    return (
      <div className="flex flex-col items-center">
        <h2 className="text-2xl font-bold mb-6">Broadcasting</h2>

        {error && (
          <div className="mb-4 p-4 bg-red-100 text-red-700 rounded-md">
            {error}
          </div>
        )}

        <div className="w-full max-w-2xl bg-black rounded-lg overflow-hidden relative">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full aspect-video"
          />

          {isLive && (
            <div className="absolute top-4 left-4 bg-red-600 text-white px-2 py-1 rounded-md flex items-center">
              <span className="w-2 h-2 bg-white rounded-full mr-2 animate-pulse"></span>
              <span className="text-xs font-bold">LIVE</span>
            </div>
          )}
        </div>

        <div className="mt-4 flex gap-4">
          <Button
            onClick={toggleCamera}
            className={
              hasCamera
                ? "bg-red-600 hover:bg-red-700"
                : "bg-blue-600 hover:bg-blue-700"
            }
          >
            {hasCamera ? "Stop Camera" : "Start Camera"}
          </Button>

          <Button
            onClick={toggleMicrophone}
            className={
              hasMic
                ? "bg-red-600 hover:bg-red-700"
                : "bg-blue-600 hover:bg-blue-700"
            }
          >
            {hasMic ? "Stop Microphone" : "Start Microphone"}
          </Button>

          {(hasCamera || hasMic) && (
            <Button
              onClick={handleGoLive}
              className={
                isLive
                  ? "bg-red-600 hover:bg-red-700"
                  : "bg-green-600 hover:bg-green-700"
              }
            >
              {isLive ? "End Stream" : "Go Live"}
            </Button>
          )}
        </div>

        {isLive && (
          <div className="mt-4 p-4 bg-gray-100 rounded-md">
            <p className="font-bold">Share this link with viewers:</p>
            <p className="text-blue-500">{window.location.origin}/live</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center">
      <h2 className="text-2xl font-bold mb-6">Watching Stream</h2>

      <div className="w-full max-w-2xl bg-black rounded-lg overflow-hidden flex items-center justify-center">
        <div className="p-8 text-white text-center">
          <p>Waiting for stream to start...</p>
          <p className="text-sm mt-2">
            When the broadcaster goes live, you'll see their stream here.
          </p>
        </div>
      </div>
    </div>
  );
};

export default LivePage;
