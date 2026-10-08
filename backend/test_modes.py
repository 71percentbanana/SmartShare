import urllib.request
import json

# 1. Create Session
session_req = urllib.request.Request(
    'http://127.0.0.1:8000/api/session',
    data=json.dumps({'device_name': 'Tester'}).encode(),
    headers={'Content-Type': 'application/json'}
)
session = json.loads(urllib.request.urlopen(session_req).read())
print("Created session:", session["session_id"])

# 2. Test Option 1: With Wi-Fi
init_wifi = urllib.request.Request(
    'http://127.0.0.1:8000/api/transfer/init',
    data=json.dumps({
        'session_id': session['session_id'],
        'file_name': 'wifi_demo.zip',
        'file_size': 10485760,
        'transfer_mode': 'with_wifi'
    }).encode(),
    headers={'Content-Type': 'application/json'}
)
res_wifi = json.loads(urllib.request.urlopen(init_wifi).read())
status_wifi = json.loads(urllib.request.urlopen(f"http://127.0.0.1:8000/api/transfer/{res_wifi['transfer_id']}/status").read())
print("Option 1 (With Wi-Fi) -> Channel:", status_wifi["active_channel"], "| Mode:", status_wifi["transfer_mode"])
assert status_wifi["active_channel"] == "wifi"
assert status_wifi["transfer_mode"] == "with_wifi"

# 3. Test Option 2: Without Wi-Fi (Bluetooth Only)
init_bt = urllib.request.Request(
    'http://127.0.0.1:8000/api/transfer/init',
    data=json.dumps({
        'session_id': session['session_id'],
        'file_name': 'bt_offline_doc.pdf',
        'file_size': 5242880,
        'transfer_mode': 'without_wifi'
    }).encode(),
    headers={'Content-Type': 'application/json'}
)
res_bt = json.loads(urllib.request.urlopen(init_bt).read())
status_bt = json.loads(urllib.request.urlopen(f"http://127.0.0.1:8000/api/transfer/{res_bt['transfer_id']}/status").read())
print("Option 2 (Without Wi-Fi) -> Channel:", status_bt["active_channel"], "| Mode:", status_bt["transfer_mode"])
assert status_bt["active_channel"] == "bluetooth"
assert status_bt["transfer_mode"] == "without_wifi"

print("\nSUCCESS: Both With Wi-Fi and Without Wi-Fi (Bluetooth-Only) options are verified and working perfectly!")
