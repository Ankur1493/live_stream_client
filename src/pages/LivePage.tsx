// src/pages/LivePage.tsx
import React, { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { io, Socket } from "socket.io-client";
import { Device } from "mediasoup-client";
import type { Transport, Producer } from "mediasoup-client/lib/types";

// Server URL (from environment variables)
const MEDIASOUP_SERVER_URL = "http://localhost:3001";

const LivePage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const isBroadcaster = searchParams.get("broadcaster") === "true";
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLive, setIsLive] = useState(false);
  const [hasCamera, setHasCamera] = useState(false);
  const [hasMic, setHasMic] = useState(false);
  const [status, setStatus] = useState<string>("");

  // WebRTC state
  const socketRef = useRef<Socket | null>(null);
  const deviceRef = useRef<Device | null>(null);
  const sendTransportRef = useRef<Transport | null>(null);
  const producersRef = useRef<Producer[]>([]);

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

  // Connect to MediaSoup server
  const connectToMediaSoup = async () => {
    try {
      // Step 1: Connect to signaling server
      setStatus("Connecting to server...");
      socketRef.current = io(MEDIASOUP_SERVER_URL);

      // Step 2: Wait for connection
      await new Promise<void>((resolve, reject) => {
        const socket = socketRef.current!;

        socket.on("connect", () => {
          console.log("Connected to signaling server");
          resolve();
        });

        socket.on("connect_error", (error: Error) => {
          console.error("Connection error:", error);
          reject(new Error("Could not connect to the server"));
        });

        // Set a timeout
        setTimeout(() => {
          if (!socket.connected) {
            reject(new Error("Connection timeout"));
          }
        }, 5000);
      });

      // Step 3: Create device
      setStatus("Initializing WebRTC...");
      deviceRef.current = new Device();

      // Step 4: Get router RTP capabilities
      const { rtpCapabilities } = await new Promise<any>((resolve, reject) => {
        socketRef.current!.emit("getRouterRtpCapabilities", resolve);
        setTimeout(
          () => reject(new Error("Timeout getting RTP capabilities")),
          5000
        );
      });

      // Step 5: Load device with router capabilities
      await deviceRef.current.load({ routerRtpCapabilities: rtpCapabilities });

      // Step 6: Create send transport
      setStatus("Creating transport...");
      const { params } = await new Promise<any>((resolve, reject) => {
        socketRef.current!.emit("createWebRtcTransport", resolve);
        setTimeout(() => reject(new Error("Timeout creating transport")), 5000);
      });

      if (params.error) {
        throw new Error(params.error);
      }

      // Step 7: Create send transport locally
      sendTransportRef.current = deviceRef.current.createSendTransport(params);

      // Step 8: Set up transport event handlers
      if (sendTransportRef.current) {
        sendTransportRef.current.on(
          "connect",
          async ({ dtlsParameters }, callback, errback) => {
            try {
              // Signal transport connection to the server
              const response = await new Promise<any>((resolve, reject) => {
                socketRef.current!.emit(
                  "connectTransport",
                  {
                    transportId: params.id,
                    dtlsParameters,
                  },
                  resolve
                );
                setTimeout(
                  () => reject(new Error("Timeout connecting transport")),
                  5000
                );
              });

              if (response.error) {
                errback(new Error(response.error));
              } else {
                callback();
              }
            } catch (error) {
              errback(error as Error);
            }
          }
        );

        sendTransportRef.current.on(
          "produce",
          async ({ kind, rtpParameters }, callback, errback) => {
            try {
              // Signal server to produce
              const response = await new Promise<any>((resolve, reject) => {
                socketRef.current!.emit(
                  "produce",
                  {
                    transportId: params.id,
                    kind,
                    rtpParameters,
                  },
                  resolve
                );
                setTimeout(() => reject(new Error("Timeout producing")), 5000);
              });

              if (response.error) {
                errback(new Error(response.error));
              } else {
                callback({ id: response.id });
              }
            } catch (error) {
              errback(error as Error);
            }
          }
        );
      }

      setStatus("Connected");
      return true;
    } catch (err) {
      console.error("Error connecting to MediaSoup server:", err);
      setError(`Connection error: ${(err as Error).message}`);
      setStatus("Connection failed");
      return false;
    }
  };

  // Start broadcasting
  const startBroadcasting = async () => {
    if (!stream) {
      setError("No media stream available");
      return false;
    }

    try {
      setStatus("Starting broadcast...");

      // Produce each track
      const tracks = stream.getTracks();
      for (const track of tracks) {
        try {
          const producer = await sendTransportRef.current!.produce({ track });
          producersRef.current.push(producer);

          console.log(`Producing ${track.kind} track`);

          producer.on("trackended", () => {
            console.log(`Track ended: ${track.kind}`);
            producer.close();
            // Remove from producers array
            producersRef.current = producersRef.current.filter(
              (p) => p.id !== producer.id
            );
          });
        } catch (error) {
          console.error(`Error producing ${track.kind}:`, error);
          setError(
            `Error producing ${track.kind}: ${(error as Error).message}`
          );
        }
      }

      setStatus("Broadcasting");
      return true;
    } catch (err) {
      console.error("Error broadcasting:", err);
      setError(`Broadcasting error: ${(err as Error).message}`);
      setStatus("Broadcast failed");
      return false;
    }
  };

  // Stop broadcasting
  const stopBroadcasting = () => {
    // Close all producers
    producersRef.current.forEach((producer) => {
      producer.close();
    });
    producersRef.current = [];

    // Close transport
    if (sendTransportRef.current) {
      sendTransportRef.current.close();
      sendTransportRef.current = null;
    }

    // Close socket connection
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    // Reset device
    deviceRef.current = null;

    setStatus("Stopped");
  };

  // Handle go live button click
  const handleGoLive = async () => {
    if (!isLive) {
      if (!stream || (!hasCamera && !hasMic)) {
        setError("Please enable camera or microphone before going live");
        return;
      }

      // Connect to MediaSoup
      const connected = await connectToMediaSoup();
      if (!connected) {
        return;
      }

      // Start broadcasting
      const broadcasting = await startBroadcasting();
      if (broadcasting) {
        setIsLive(true);
      }
    } else {
      // Stop broadcasting
      stopBroadcasting();

      // Stop local stream
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

      setIsLive(false);
    }
  };

  // Cleanup on component unmount
  useEffect(() => {
    return () => {
      if (isLive) {
        stopBroadcasting();
      }

      if (stream) {
        stream.getTracks().forEach((track) => {
          track.stop();
        });
      }
    };
  }, [isLive, stream]);

  if (isBroadcaster) {
    return (
      <div className="flex flex-col items-center">
        <h2 className="text-2xl font-bold mb-6">Broadcasting</h2>
        {error && (
          <div className="mb-4 p-4 bg-red-100 text-red-700 rounded-md">
            {error}
          </div>
        )}
        {status && (
          <div className="mb-4 p-2 bg-blue-100 text-blue-700 rounded-md">
            Status: {status}
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
