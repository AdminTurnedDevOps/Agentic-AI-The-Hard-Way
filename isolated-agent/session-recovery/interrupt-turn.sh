#!/usr/bin/env bash
set -euo pipefail

session_id=${1:?Pass the Session ID from step 2}
actor_uid=${2:?Pass the Actor UID from step 2}
snapshot_uuid=${3:?Pass the snapshot UUID from step 2}

get_actor() {
  kubectl ate get actor "session-$session_id" -a kagent -o json |
    jq -ce --arg uid "$actor_uid" 'select(.metadata.uid == $uid)'
}

latest_snapshot() {
  jq -er '[.status.snapshots[]? |
    select(.owner == "SNAPSHOT_OWNER_ACTOR" and
           .durableSnapshot.state == "SNAPSHOT_STORAGE_STATE_COMPLETED")]
    | max_by(.generation | tonumber) | .uuid'
}

running_worker() {
  jq -ce '
    select(.status.state == "ACTOR_STATE_RUNNING")
    | .status.workerAssignment
    | select(.workerNamespace == "kagent" and
             (.workerPod | length > 0) and (.workerPodUid | length > 0))
    | {workerPod, workerPodUid}
  '
}

fail() {
  printf '%s\n' "$*" >&2
  exit 1
}

actor=$(get_actor)
[[ $(jq -er '.status.state' <<<"$actor") == ACTOR_STATE_SUSPENDED &&
   $(latest_snapshot <<<"$actor") == "$snapshot_uuid" ]] ||
  fail "The Actor is no longer suspended at the snapshot from step 2."

turn_log=$(mktemp)
kagent --user-id admin@kagent.dev -n kagent --timeout 5m agent invoke --session "$session_id" \
  --stream --task 'Write a numbered checklist of 200 release-readiness checks, with one sentence per item.' \
  >"$turn_log" 2>&1 &
turn_pid=$!

cleanup() {
  local status=$?
  kill "$turn_pid" 2>/dev/null || true
  wait "$turn_pid" 2>/dev/null || true
  if (( status != 0 )); then
    tail -n 10 "$turn_log" >&2
  fi
  rm -f "$turn_log"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

printf 'Started the turn. Waiting for its worker assignment.\n' >&2
assignment=''
for ((attempt = 0; attempt < 120; attempt++)); do
  kill -0 "$turn_pid" 2>/dev/null || fail "The turn ended before a worker could be removed."
  actor=$(get_actor)
  if assignment=$(running_worker <<<"$actor"); then
    break
  fi
  sleep 0.5
done
[[ -n "$assignment" ]] || fail "Timed out waiting for a running worker."

pod=$(jq -er '.workerPod' <<<"$assignment")
uid=$(jq -er '.workerPodUid' <<<"$assignment")
kubectl -n kagent get pod "$pod" -o json | jq -e --arg uid "$uid" '
  .metadata.uid == $uid and .metadata.labels["ate.dev/worker-pool"] == "worker-loss-lab"
' >/dev/null || fail "The assigned pod UID or lab pool could not be confirmed."

actor=$(get_actor)
[[ $(running_worker <<<"$actor") == "$assignment" &&
   $(latest_snapshot <<<"$actor") == "$snapshot_uuid" ]] &&
  kill -0 "$turn_pid" 2>/dev/null ||
  fail "The turn ended or its worker or snapshot changed before deletion."

printf 'Force-deleting worker pod kagent/%s (%s).\n' "$pod" "$uid" >&2
kubectl -n kagent delete pod "$pod" --grace-period=0 --force --wait=false >&2

for ((attempt = 0; attempt < 60; attempt++)); do
  actor=$(get_actor)
  state=$(jq -er '.status.state' <<<"$actor")
  if [[ "$state" == ACTOR_STATE_CRASHED ]]; then
    [[ $(latest_snapshot <<<"$actor") == "$snapshot_uuid" ]] ||
      fail "The crashed Actor has a different durable snapshot."
    printf 'Actor is CRASHED and still has snapshot %s.\n' "$snapshot_uuid" >&2
    printf '%s\n' "$uid"
    exit 0
  fi
  if [[ "$state" == ACTOR_STATE_SUSPENDED ]]; then
    fail "The turn checkpointed before the worker loss was recorded."
  fi
  sleep 2
done
fail "Timed out waiting for CRASHED (last state: $state)."
