"use client";

import { useEffect, useRef, useState } from "react";
import {
  addDoc,
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where
} from "firebase/firestore";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { getFirebaseDb } from "@/lib/firebase";
import { EmptyState, LoadingState, PageHeading, Panel, PrimaryButton, SecondaryButton } from "@/components/ui/DashboardPrimitives";

const db = getFirebaseDb();
const ICE_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }];

function displayName(user) {
  return user.displayName || user.email?.split("@")[0] || "Community member";
}

function getError(error) {
  if (error.name === "NotAllowedError" || error.name === "PermissionDeniedError") {
    return "Allow microphone or camera access in your browser to start the call.";
  }
  if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") {
    return "No compatible microphone or camera was found on this device.";
  }
  if (error.code === "permission-denied") {
    return "Call access was denied. Make sure you and the person you are calling are still group members.";
  }
  if (error.code === "unavailable") {
    return "The call service is unavailable. Check your connection and try again.";
  }
  return error.message || "The call could not be completed.";
}

async function removeCallSignals(callId) {
  const signals = await getDocs(collection(db, "callSessions", callId, "signals"));
  await Promise.all(signals.docs.map((signal) => deleteDoc(signal.ref)));
}

async function closeCallAfterFailure(callId, ringingStatus) {
  const callRef = doc(db, "callSessions", callId);
  const snapshot = await getDoc(callRef);
  if (!snapshot.exists()) return;
  const status = snapshot.data().status;
  if (status === "ringing" || status === "active") {
    const nextStatus = status === "active" ? "ended" : ringingStatus;
    await updateDoc(callRef, {
      status: nextStatus,
      offer: null,
      answer: null,
      updatedAt: serverTimestamp(),
      endedAt: serverTimestamp()
    });
  }
  await removeCallSignals(callId);
}

export default function CallsWorkspace({
  embeddedGroupId = "",
  embeddedCallType = "audio",
  embedded = false,
  onClose,
  onIncomingCall
} = {}) {
  const { user, loading: authLoading } = useCurrentUser();
  const [groups, setGroups] = useState([]);
  const [groupId, setGroupId] = useState(embeddedGroupId);
  const [calleeUid, setCalleeUid] = useState("");
  const [callType, setCallType] = useState(embeddedCallType);
  const [calls, setCalls] = useState([]);
  const [currentCall, setCurrentCall] = useState(null);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connectionState, setConnectionState] = useState("new");
  const [loadingGroups, setLoadingGroups] = useState(true);
  const [error, setError] = useState("");
  const [callQueryError, setCallQueryError] = useState("");
  const [notice, setNotice] = useState("");
  const peerRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const currentCallRef = useRef(currentCall);
  const finishLocalCallRef = useRef(null);
  const pendingCandidatesRef = useRef([]);
  const receivedCandidateIdsRef = useRef(new Set());
  const callQueryErrorsRef = useRef({ caller: "", callee: "" });
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const remoteAudioRef = useRef(null);
  currentCallRef.current = currentCall;
  finishLocalCallRef.current = finishLocalCall;

  useEffect(() => {
    if (!user) return undefined;
    let live = true;
    const stopMemberships = onSnapshot(
      query(collectionGroup(db, "members"), where("uid", "==", user.uid)),
      async (snapshot) => {
        try {
          const memberships = await Promise.all(snapshot.docs.map(async (membership) => {
            const groupRef = membership.ref.parent.parent;
            if (!groupRef) return null;
            const [groupSnapshot, membersSnapshot] = await Promise.all([
              getDoc(groupRef),
              getDocs(collection(db, "prayerGroups", groupRef.id, "members"))
            ]);
            if (!groupSnapshot.exists()) return null;
            return {
              id: groupRef.id,
              name: groupSnapshot.data().name || "Prayer group",
              members: membersSnapshot.docs
                .map((member) => ({ uid: member.id, ...member.data() }))
                .filter((member) => member.uid !== user.uid)
            };
          }));
          if (!live) return;
          const availableGroups = memberships.filter((group) =>
            group && group.members.length && (!embeddedGroupId || group.id === embeddedGroupId)
          );
          setGroups(availableGroups);
          setGroupId((current) =>
            availableGroups.some((group) => group.id === current)
              ? current
              : embeddedGroupId || availableGroups[0]?.id || ""
          );
          setError("");
        } catch (groupError) {
          if (live) setError(getError(groupError));
        } finally {
          if (live) setLoadingGroups(false);
        }
      },
      (snapshotError) => {
        if (live) {
          setError(getError(snapshotError));
          setLoadingGroups(false);
        }
      }
    );
    return () => {
      live = false;
      stopMemberships();
    };
  }, [user, embeddedGroupId]);

  useEffect(() => {
    if (!user) return undefined;
    let callerSessions = [];
    let calleeSessions = [];
    function updateCalls() {
      const byId = new Map([...callerSessions, ...calleeSessions].map((call) => [call.id, call]));
      setCalls([...byId.values()]);
    }
    function setQueryError(source, message) {
      callQueryErrorsRef.current = { ...callQueryErrorsRef.current, [source]: message };
      setCallQueryError(Object.values(callQueryErrorsRef.current).find(Boolean) || "");
    }
    const stopCaller = onSnapshot(
      query(collection(db, "callSessions"), where("callerUid", "==", user.uid), where("status", "in", ["ringing", "active"])),
      (snapshot) => {
        callerSessions = snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }));
        setQueryError("caller", "");
        updateCalls();
      },
      (snapshotError) => setQueryError("caller", getError(snapshotError))
    );
    const stopCallee = onSnapshot(
      query(collection(db, "callSessions"), where("calleeUid", "==", user.uid), where("status", "in", ["ringing", "active"])),
      (snapshot) => {
        calleeSessions = snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }));
        setQueryError("callee", "");
        updateCalls();
      },
      (snapshotError) => setQueryError("callee", getError(snapshotError))
    );
    return () => {
      stopCaller();
      stopCallee();
    };
  }, [user]);

  useEffect(() => {
    if (localVideoRef.current) localVideoRef.current.srcObject = localStream;
    if (currentCall?.callType === "video" && remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
    if (currentCall?.callType === "audio" && remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = remoteStream;
    }
  }, [currentCall, localStream, remoteStream]);

  useEffect(() => {
    const callState = currentCallRef.current;
    if (!callState || !user) return undefined;
    let live = true;
    const otherUid = callState.callerUid === user.uid ? callState.calleeUid : callState.callerUid;
    const callRef = doc(db, "callSessions", callState.id);
    const stopCall = onSnapshot(
      callRef,
      async (snapshot) => {
        if (!live) return;
        if (!snapshot.exists()) {
          finishLocalCallRef.current?.("The other participant ended the call.");
          return;
        }
        const call = snapshot.data();
        if (call.status === "ended" || call.status === "declined") {
          finishLocalCallRef.current?.(call.status === "declined" ? "The call was declined." : "The call has ended.");
          try {
            await removeCallSignals(callState.id);
          } catch (cleanupError) {
            setError(getError(cleanupError));
          }
          return;
        }
        const peer = peerRef.current;
        if (
          callState.callerUid === user.uid &&
          call.answer?.sdp &&
          peer &&
          !peer.currentRemoteDescription
        ) {
          try {
            await peer.setRemoteDescription(new RTCSessionDescription(call.answer));
            await flushPendingCandidates(peer);
          } catch (descriptionError) {
            if (live) setError(getError(descriptionError));
          }
        }
      },
      (snapshotError) => {
        if (live) setError(getError(snapshotError));
      }
    );
    const stopSignals = onSnapshot(
      query(collection(db, "callSessions", callState.id, "signals"), where("senderUid", "==", otherUid)),
      (snapshot) => {
        const peer = peerRef.current;
        if (!peer) return;
        snapshot.docChanges().forEach((change) => {
          if (change.type === "removed" || receivedCandidateIdsRef.current.has(change.doc.id)) return;
          receivedCandidateIdsRef.current.add(change.doc.id);
          const candidate = new RTCIceCandidate(change.doc.data().candidate);
          if (peer.remoteDescription) {
            peer.addIceCandidate(candidate).catch((candidateError) => {
              if (live) setError(getError(candidateError));
            });
          } else {
            pendingCandidatesRef.current.push(candidate);
          }
        });
      },
      (snapshotError) => {
        if (live) setError(getError(snapshotError));
      }
    );
    return () => {
      live = false;
      stopCall();
      stopSignals();
      disposePeer();
    };
  }, [currentCall?.id, currentCall?.callerUid, currentCall?.calleeUid, user]);

  async function flushPendingCandidates(peer) {
    const candidates = pendingCandidatesRef.current.splice(0);
    await Promise.all(candidates.map((candidate) => peer.addIceCandidate(candidate)));
  }

  function disposePeer() {
    if (peerRef.current) {
      peerRef.current.onicecandidate = null;
      peerRef.current.close();
    }
    peerRef.current = null;
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    remoteStreamRef.current = null;
    pendingCandidatesRef.current = [];
    receivedCandidateIdsRef.current.clear();
    setLocalStream(null);
    setRemoteStream(null);
    setConnectionState("new");
    setMuted(false);
    setCameraOff(false);
  }

  function finishLocalCall(message) {
    disposePeer();
    setCurrentCall(null);
    setConnecting(false);
    setNotice(message);
  }

  async function startCall(event) {
    event.preventDefault();
    const selectedGroup = groups.find((group) => group.id === groupId);
    const callee = selectedGroup?.members.find((member) => member.uid === calleeUid);
    if (!user || !selectedGroup || !callee) {
      setError("Choose a prayer-group member to call.");
      return;
    }
    setConnecting(true);
    setError("");
    setNotice("");
    let callRef;
    let callCreated = false;
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Voice and video calls require a browser with media-device support over HTTPS or localhost.");
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: callType === "video"
      });
      const peer = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      const remote = new MediaStream();
      callRef = doc(collection(db, "callSessions"));
      peerRef.current = peer;
      localStreamRef.current = stream;
      remoteStreamRef.current = remote;
      stream.getTracks().forEach((track) => peer.addTrack(track, stream));
      peer.ontrack = (event) => {
        const [incoming] = event.streams;
        if (incoming) incoming.getTracks().forEach((track) => remote.addTrack(track));
        setRemoteStream(remote);
      };
      peer.onconnectionstatechange = () => setConnectionState(peer.connectionState);
      const offer = await peer.createOffer();
      await setDoc(callRef, {
        participantUids: [user.uid, callee.uid],
        callerUid: user.uid,
        callerName: displayName(user),
        calleeUid: callee.uid,
        calleeName: callee.displayName || "Prayer group member",
        groupId: selectedGroup.id,
        callType,
        status: "ringing",
        offer: { type: offer.type, sdp: offer.sdp },
        answer: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        endedAt: null
      });
      callCreated = true;
      peer.onicecandidate = (iceEvent) => {
        if (!iceEvent.candidate) return;
        addDoc(collection(db, "callSessions", callRef.id, "signals"), {
          senderUid: user.uid,
          candidate: iceEvent.candidate.toJSON(),
          createdAt: serverTimestamp()
        }).catch((signalError) => setError(getError(signalError)));
      };
      await peer.setLocalDescription(offer);
      setLocalStream(stream);
      setRemoteStream(remote);
      setCurrentCall({
        id: callRef.id,
        callerUid: user.uid,
        calleeUid: callee.uid,
        callType,
        otherName: callee.displayName || "Prayer group member"
      });
      setNotice("Calling. Keep this page open while the other person answers.");
    } catch (callError) {
      let message = getError(callError);
      if (callRef && callCreated) {
        try {
          await closeCallAfterFailure(callRef.id, "ended");
        } catch (cleanupError) {
          message = `${message} Call cleanup also failed: ${getError(cleanupError)}`;
        }
      }
      disposePeer();
      setError(message);
    } finally {
      setConnecting(false);
    }
  }

  async function acceptCall(call) {
    setConnecting(true);
    setError("");
    setNotice("");
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Voice and video calls require a browser with media-device support over HTTPS or localhost.");
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: call.callType === "video"
      });
      const peer = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      const remote = new MediaStream();
      peerRef.current = peer;
      localStreamRef.current = stream;
      remoteStreamRef.current = remote;
      stream.getTracks().forEach((track) => peer.addTrack(track, stream));
      peer.ontrack = (event) => {
        const [incoming] = event.streams;
        if (incoming) incoming.getTracks().forEach((track) => remote.addTrack(track));
        setRemoteStream(remote);
      };
      peer.onconnectionstatechange = () => setConnectionState(peer.connectionState);
      peer.onicecandidate = (iceEvent) => {
        if (!iceEvent.candidate) return;
        addDoc(collection(db, "callSessions", call.id, "signals"), {
          senderUid: user.uid,
          candidate: iceEvent.candidate.toJSON(),
          createdAt: serverTimestamp()
        }).catch((signalError) => setError(getError(signalError)));
      };
      await peer.setRemoteDescription(new RTCSessionDescription(call.offer));
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      await updateDoc(doc(db, "callSessions", call.id), {
        status: "active",
        answer: { type: answer.type, sdp: answer.sdp },
        updatedAt: serverTimestamp()
      });
      await flushPendingCandidates(peer);
      setLocalStream(stream);
      setRemoteStream(remote);
      setCurrentCall({
        id: call.id,
        callerUid: call.callerUid,
        calleeUid: call.calleeUid,
        callType: call.callType,
        otherName: call.callerName || "Prayer group member"
      });
    } catch (callError) {
      disposePeer();
      let message = getError(callError);
      try {
        await closeCallAfterFailure(call.id, "declined");
      } catch (declineError) {
        message = `${message} The invitation could not be closed: ${getError(declineError)}`;
      }
      setError(message);
    } finally {
      setConnecting(false);
    }
  }

  async function declineCall(call) {
    setError("");
    try {
      await updateDoc(doc(db, "callSessions", call.id), {
        status: "declined",
        offer: null,
        answer: null,
        updatedAt: serverTimestamp(),
        endedAt: serverTimestamp()
      });
      await removeCallSignals(call.id);
      setNotice("The call was declined.");
    } catch (declineError) {
      setError(getError(declineError));
    }
  }

  async function endCall() {
    if (!currentCall) return;
    const callId = currentCall.id;
    setError("");
    try {
      const callRef = doc(db, "callSessions", callId);
      const callSnapshot = await getDoc(callRef);
      if (callSnapshot.exists() && ["ringing", "active"].includes(callSnapshot.data().status)) {
        await updateDoc(callRef, {
          status: "ended",
          offer: null,
          answer: null,
          updatedAt: serverTimestamp(),
          endedAt: serverTimestamp()
        });
      }
      await removeCallSignals(callId);
      finishLocalCall("The call has ended.");
    } catch (endError) {
      setError(getError(endError));
    }
  }

  function toggleMuted() {
    const enabled = !muted;
    localStreamRef.current?.getAudioTracks().forEach((track) => { track.enabled = !enabled; });
    setMuted(enabled);
  }

  function toggleCamera() {
    const disabled = !cameraOff;
    localStreamRef.current?.getVideoTracks().forEach((track) => { track.enabled = !disabled; });
    setCameraOff(disabled);
  }

  const activeGroup = groups.find((group) => group.id === groupId);
  const incomingCalls = calls.filter((call) => call.calleeUid === user?.uid && call.status === "ringing");
  const outgoingCalls = calls.filter((call) => call.callerUid === user?.uid && call.status === "ringing");
  const incomingCallId = incomingCalls[0]?.id;
  const incomingCallType = incomingCalls[0]?.callType;

  useEffect(() => {
    if (embedded && incomingCallType) {
      onIncomingCall?.(incomingCallType);
    }
  }, [embedded, incomingCallId, incomingCallType, onIncomingCall]);

  if (authLoading || loadingGroups) return <LoadingState label="Loading your prayer groups…" />;

  return (
    <div className="space-y-6">
      {!embedded && <PageHeading
        eyebrow="Together"
        title="Prayer calls"
        description="Connect with someone from one of your prayer groups for a private audio or video prayer."
      />}
      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {callQueryError && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{callQueryError}</p>}
      {notice && <p role="status" className="rounded-xl border border-teal-200 bg-teal-50 p-3 text-sm text-teal-900">{notice}</p>}

      {currentCall ? (
        <Panel className={embedded ? "border-0 shadow-none" : ""}>
          <div className="flex flex-col gap-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">
                {currentCall.callType === "video" ? "Video call" : "Audio call"}
              </p>
              <h2 className="mt-1 text-xl font-semibold text-slate-950">
                {currentCall.otherName || "Prayer group member"}
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                {connecting ? "Connecting…" : connectionState === "connected" ? "Connected" : "Waiting for a secure peer connection"}
              </p>
            </div>
            <div className={`grid gap-3 ${currentCall.callType === "video" ? "sm:grid-cols-2" : ""}`}>
              {currentCall.callType === "video" && (
                <>
                  <video ref={remoteVideoRef} autoPlay playsInline className="aspect-video w-full rounded-2xl bg-slate-950 object-cover" />
                  <video ref={localVideoRef} autoPlay playsInline muted className="aspect-video w-full rounded-2xl bg-slate-950 object-cover" />
                </>
              )}
              {currentCall.callType === "audio" && (
                <>
                  <audio ref={remoteAudioRef} autoPlay />
                  <div className="grid min-h-40 place-items-center rounded-2xl bg-teal-50 text-teal-900">
                    <span className="text-5xl" aria-hidden="true">♪</span>
                    <span className="sr-only">Audio call</span>
                  </div>
                </>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <SecondaryButton type="button" onClick={toggleMuted}>{muted ? "Unmute" : "Mute microphone"}</SecondaryButton>
              {currentCall.callType === "video" && (
                <SecondaryButton type="button" onClick={toggleCamera}>{cameraOff ? "Turn camera on" : "Turn camera off"}</SecondaryButton>
              )}
              <button type="button" onClick={endCall} className="inline-flex min-h-10 items-center justify-center rounded-xl bg-red-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-800">
                End call
              </button>
            </div>
          </div>
        </Panel>
      ) : embedded && incomingCalls.length > 0 ? (
        <Panel className="border-0 shadow-none">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-teal-700">Incoming internet call</p>
          <h2 className="mt-2 text-xl font-bold text-slate-950">{incomingCalls[0].callerName || "A prayer group member"} is calling</h2>
          <p className="mt-1 text-sm text-slate-600">{incomingCalls[0].callType === "video" ? "Video call" : "Audio call"} · uses Wi-Fi or mobile data</p>
          <div className="mt-5 flex gap-2">
            <PrimaryButton type="button" disabled={connecting} onClick={() => acceptCall(incomingCalls[0])}>Answer</PrimaryButton>
            <SecondaryButton type="button" disabled={connecting} onClick={() => declineCall(incomingCalls[0])}>Decline</SecondaryButton>
          </div>
        </Panel>
      ) : (
        <div className={embedded ? "space-y-4" : "grid gap-5 lg:grid-cols-2"}>
          <Panel className={embedded ? "border-0 shadow-none" : ""}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-950">{embedded ? `${callType === "video" ? "Video" : "Audio"} internet call` : "Start a call"}</h2>
                <p className="mt-1 text-xs leading-5 text-slate-500">Uses Wi-Fi or mobile data, not your phone minutes.</p>
              </div>
              {embedded && (
                <button type="button" onClick={onClose} aria-label="Close call window" className="rounded-lg px-2 py-1 text-slate-500 hover:bg-slate-100">
                  ×
                </button>
              )}
            </div>
            {groups.length === 0 ? (
              <div className="mt-4">
                <EmptyState title="Join a prayer group first" description="Calls are only available between members of the same prayer group." />
              </div>
            ) : (
              <form onSubmit={startCall} className="mt-4 space-y-4">
                {!embedded && <label className="block text-sm font-medium text-slate-800">
                  Prayer group
                  <select className="auth-input mt-1.5" value={groupId} onChange={(event) => { setGroupId(event.target.value); setCalleeUid(""); }}>
                    {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
                  </select>
                </label>}
                <label className="block text-sm font-medium text-slate-800">
                  Call a group member
                  <select className="auth-input mt-1.5" value={calleeUid} onChange={(event) => setCalleeUid(event.target.value)} required>
                    <option value="">Choose a member</option>
                    {(activeGroup?.members || []).map((member) => (
                      <option key={member.uid} value={member.uid}>{member.displayName || "Prayer group member"}</option>
                    ))}
                  </select>
                </label>
                {!embedded && <label className="block text-sm font-medium text-slate-800">
                  Call type
                  <select className="auth-input mt-1.5" value={callType} onChange={(event) => setCallType(event.target.value)}>
                    <option value="audio">Audio</option>
                    <option value="video">Video</option>
                  </select>
                </label>}
                <PrimaryButton type="submit" disabled={connecting || !calleeUid}>
                  {connecting ? "Starting call…" : `Start ${callType} call`}
                </PrimaryButton>
                <p className="text-xs leading-5 text-slate-500">
                  Both people need to be online in this group chat to answer. Allow microphone access when prompted; video also needs camera access. Direct peer-to-peer calls may reveal your network IP address to the other participant.
                </p>
              </form>
            )}
          </Panel>
          {!embedded && <Panel>
            <h2 className="text-lg font-semibold text-slate-950">Call invitations</h2>
            <div className="mt-4 space-y-3">
              {incomingCalls.map((call) => (
                <div key={call.id} className="rounded-xl border border-teal-100 bg-teal-50/70 p-4">
                  <p className="text-sm font-semibold text-slate-900">{call.callerName || "A prayer group member"} is calling</p>
                  <p className="mt-1 text-xs text-slate-600">{call.callType === "video" ? "Video" : "Audio"} prayer call</p>
                  <div className="mt-3 flex gap-2">
                    <PrimaryButton type="button" disabled={connecting} onClick={() => acceptCall(call)}>Answer</PrimaryButton>
                    <SecondaryButton type="button" disabled={connecting} onClick={() => declineCall(call)}>Decline</SecondaryButton>
                  </div>
                </div>
              ))}
              {outgoingCalls.map((call) => (
                <div key={call.id} className="rounded-xl border border-slate-200 p-4">
                  <p className="text-sm font-semibold text-slate-900">Calling {call.calleeName || "a prayer group member"}</p>
                  <p className="mt-1 text-xs text-slate-600">Waiting for an answer…</p>
                  <SecondaryButton type="button" className="mt-3" onClick={() => setCurrentCall({
                    id: call.id,
                    callerUid: call.callerUid,
                    calleeUid: call.calleeUid,
                    callType: call.callType,
                    otherName: call.calleeName
                  })}>Return to call</SecondaryButton>
                </div>
              ))}
              {incomingCalls.length === 0 && outgoingCalls.length === 0 && (
                <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">There are no incoming or outgoing calls right now.</p>
              )}
            </div>
          </Panel>}
        </div>
      )}
      <p className="text-xs leading-5 text-slate-500">
        Calls use a direct peer-to-peer connection. Some networks or firewalls require a TURN relay; if a direct connection cannot be established, ask your administrator to configure a trusted TURN service.
      </p>
    </div>
  );
}
