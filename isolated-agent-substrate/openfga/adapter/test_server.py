import os
import tempfile
import unittest
from unittest.mock import Mock

import server


class AdapterTests(unittest.TestCase):
    def setUp(self):
        self.old = server.STORE_ID, server.MODEL_ID, server.TOKEN_PATH
        server.STORE_ID, server.MODEL_ID = "store", "model"
        self.token = tempfile.NamedTemporaryFile(mode="w", delete=False)
        self.token.write("reviewer-token")
        self.token.close()
        server.TOKEN_PATH = self.token.name

    def tearDown(self):
        server.STORE_ID, server.MODEL_ID, server.TOKEN_PATH = self.old
        os.unlink(self.token.name)

    def session(self, name="alice", allowed=True):
        session = Mock()
        session.post.side_effect = [
            Mock(json=lambda: {"status": {"authenticated": True,
                  "audiences": ["openfga-actors"], "user": {"username":
                      "system:serviceaccount:openfga-actors:" + name}}}),
            Mock(json=lambda: {"allowed": allowed}),
        ]
        return session

    def test_allowed_uses_verified_principal_and_current_uid(self):
        session = self.session()
        status, _ = server.authorize({"Authorization": "Bearer client-token",
            "ate-target-actor": "ate-demo-counter/tool-a", "x-user": "bob"},
            session, lambda space, name: "real-uid")
        self.assertEqual(status, 200)
        check = session.post.call_args_list[1].kwargs["json"]
        self.assertEqual(check["tuple_key"], {"user": "user:alice",
            "relation": "can_invoke", "object": "actor:real-uid"})

    def test_no_token_or_invalid_target_never_reaches_dependencies(self):
        session = Mock()
        self.assertEqual(server.authorize({"ate-target-actor": "a/b"}, session)[0], 401)
        self.assertEqual(server.authorize({"Authorization": "Bearer token",
            "ate-target-actor": "../../foo"}, session)[0], 400)
        session.post.assert_not_called()

    def test_denied_and_failed_openfga(self):
        session = self.session(allowed=False)
        headers = {"Authorization": "Bearer token", "ate-target-actor": "ate-demo-counter/tool-b"}
        self.assertEqual(server.authorize(headers, session, lambda *_: "uid")[0], 403)
        session = Mock()
        session.post.side_effect = [
            Mock(json=lambda: {"status": {"authenticated": True,
                "audiences": ["openfga-actors"], "user": {"username":
                    "system:serviceaccount:openfga-actors:alice"}}}),
            Mock(raise_for_status=Mock(side_effect=server.requests.HTTPError("failed"))),
        ]
        self.assertEqual(server.authorize(headers, session, lambda *_: "uid")[0], 503)

    def test_other_service_account_not_accepted(self):
        session = self.session(name="admin")
        status, _ = server.authorize({"Authorization": "Bearer token",
            "ate-target-actor": "ate-demo-counter/tool-a"}, session)
        self.assertEqual(status, 403)
        self.assertEqual(session.post.call_count, 1)

    def test_failed_token_review_cannot_reach_actor_or_openfga(self):
        session = Mock()
        session.post.return_value.json.return_value = {"status": {"authenticated": False}}
        status, _ = server.authorize({"Authorization": "Bearer forged",
            "ate-target-actor": "ate-demo-counter/tool-a"}, session)
        self.assertEqual(status, 401)
        self.assertEqual(session.post.call_count, 1)


if __name__ == "__main__":
    unittest.main()
