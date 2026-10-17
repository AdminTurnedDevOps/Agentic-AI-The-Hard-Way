"""HTTP external authorization for agentgateway, backed by OpenFGA.

Kubernetes TokenReview authenticates the caller; the current Substrate Actor UID
comes from GetActor over TLS. No caller-supplied identity or UID is trusted.
"""

import json
import os
import re
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import grpc
import requests

import ateapi_subset_pb2 as pb
import ateapi_subset_pb2_grpc as rpc


TARGET = re.compile(r"^([a-z0-9]([-a-z0-9]*[a-z0-9])?)/([a-z0-9]([-a-z0-9]*[a-z0-9])?)$")
TOKEN_PATH = os.getenv("K8S_TOKEN_PATH", "/var/run/secrets/kubernetes.io/serviceaccount/token")
ATE_TOKEN_PATH = os.getenv("ATE_TOKEN_PATH", "/run/ate-token/token")
K8S_CA_PATH = os.getenv("K8S_CA_PATH", "/var/run/secrets/kubernetes.io/serviceaccount/ca.crt")
ATE_CA_PATH = os.getenv("ATE_CA_PATH", "/run/servicedns-ca/trust-bundle.pem")
OPENFGA_URL = os.getenv("OPENFGA_URL", "http://openfga.openfga-actors.svc:8080")
ATE_ADDRESS = os.getenv("ATE_ADDRESS", "api.ate-system.svc:443")
STORE_ID = os.getenv("OPENFGA_STORE_ID", "")
MODEL_ID = os.getenv("OPENFGA_MODEL_ID", "")
CALLER_NAMESPACE = os.getenv("CALLER_NAMESPACE", "openfga-actors")
K8S_API = os.getenv("K8S_API", "https://kubernetes.default.svc")


def authorize(headers, session=requests, actor_lookup=None):
    """Return (HTTP code, reason). All errors are denials, never allow."""
    raw = headers.get("Authorization", "")
    if not raw.startswith("Bearer ") or not raw[7:].strip():
        return 401, "missing bearer token"
    target = headers.get("ate-target-actor", "")
    if not TARGET.fullmatch(target) or len(target) > 254:
        return 400, "invalid target actor"
    if not STORE_ID or not MODEL_ID:
        return 503, "authorization is not configured"

    try:
        with open(TOKEN_PATH, encoding="utf-8") as file:
            service_token = file.read().strip()
        review = session.post(
            K8S_API + "/apis/authentication.k8s.io/v1/tokenreviews",
            json={"apiVersion": "authentication.k8s.io/v1", "kind": "TokenReview",
                  "spec": {"token": raw[7:].strip(), "audiences": ["openfga-actors"]}},
            headers={"Authorization": "Bearer " + service_token},
            verify=K8S_CA_PATH, timeout=3,
        )
        review.raise_for_status()
        identity = review.json()["status"]
        if not identity.get("authenticated") or "openfga-actors" not in identity.get("audiences", []):
            return 401, "invalid token"
        prefix = "system:serviceaccount:" + CALLER_NAMESPACE + ":"
        username = identity.get("user", {}).get("username", "")
        if not username.startswith(prefix) or username[len(prefix):] not in ("alice", "bob"):
            return 403, "caller is not a demo principal"

        atespace, name = target.split("/", 1)
        uid = (actor_lookup or get_actor_uid)(atespace, name)
        if not uid:
            return 503, "actor has no UID"
        check = session.post(
            OPENFGA_URL.rstrip("/") + "/stores/" + STORE_ID + "/check",
            json={"authorization_model_id": MODEL_ID,
                  "tuple_key": {"user": "user:" + username[len(prefix):],
                                "relation": "can_invoke", "object": "actor:" + uid}},
            timeout=3,
        )
        check.raise_for_status()
        if check.json().get("allowed") is True:
            return 200, "allowed"
        return 403, "not permitted"
    except (OSError, ValueError, KeyError, grpc.RpcError, requests.RequestException):
        return 503, "authorization dependency unavailable"


def get_actor_uid(atespace, name):
    with open(ATE_CA_PATH, "rb") as file:
        ca = file.read()
    with open(ATE_TOKEN_PATH, encoding="utf-8") as file:
        token = file.read().strip()
    channel = grpc.secure_channel(ATE_ADDRESS, grpc.ssl_channel_credentials(root_certificates=ca))
    try:
        actor = rpc.ControlStub(channel).GetActor(
            pb.GetActorRequest(actor=pb.ObjectRef(atespace=atespace, name=name)),
            metadata=(("authorization", "Bearer " + token),), timeout=3,
        )
        if actor.metadata.atespace != atespace or actor.metadata.name != name:
            raise ValueError("actor lookup mismatch")
        return actor.metadata.uid
    finally:
        channel.close()


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/healthz":
            self.send_response(200)
            self.end_headers()
        elif self.path == "/authorize":
            self.respond()
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        if self.path != "/authorize":
            self.send_response(404)
            self.end_headers()
            return
        self.respond()

    def respond(self):
        code, reason = authorize(self.headers)
        body = json.dumps({"reason": reason}).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", 8080), Handler).serve_forever()
