package com.fpnerd.tavla;

import android.Manifest;
import android.annotation.SuppressLint;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothGatt;
import android.bluetooth.BluetoothGattCallback;
import android.bluetooth.BluetoothGattCharacteristic;
import android.bluetooth.BluetoothGattDescriptor;
import android.bluetooth.BluetoothGattServer;
import android.bluetooth.BluetoothGattServerCallback;
import android.bluetooth.BluetoothGattService;
import android.bluetooth.BluetoothLeAdvertiser;
import android.bluetooth.BluetoothLeScanner;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothProfile;
import android.bluetooth.le.AdvertiseCallback;
import android.bluetooth.le.AdvertiseData;
import android.bluetooth.le.AdvertiseSettings;
import android.bluetooth.le.ScanCallback;
import android.bluetooth.le.ScanFilter;
import android.bluetooth.le.ScanResult;
import android.bluetooth.le.ScanSettings;
import android.content.Context;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.ParcelUuid;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.UUID;

/**
 * Bluetooth Low Energy taşıma katmanı.
 *
 * Kurucu telefon (host) bir GATT sunucusu açar ve 4 harflik oda kodunu
 * reklam paketinde yayınlar. Katılan telefon (guest) kodu tarar, bağlanır ve
 * iki taraf da JSON mesajlarını parçalayarak (4 bayt uzunluk + UTF-8 gövde)
 * aynı PeerJS protokolüyle konuşur.
 */
@CapacitorPlugin(
    name = "BleTavla",
    permissions = {
        @Permission(
            alias = "ble",
            strings = {
                Manifest.permission.BLUETOOTH_SCAN,
                Manifest.permission.BLUETOOTH_CONNECT,
                Manifest.permission.BLUETOOTH_ADVERTISE
            }
        ),
        @Permission(
            alias = "bleLegacy",
            strings = {
                Manifest.permission.ACCESS_FINE_LOCATION,
                Manifest.permission.BLUETOOTH,
                Manifest.permission.BLUETOOTH_ADMIN
            }
        )
    }
)
public class BleTavlaPlugin extends Plugin {

    /** Reklamda kullanılan 16-bit servis UUID'si (paket boyutu için kısa). */
    private static final UUID ADV_SERVICE = UUID.fromString("0000a1b0-0000-1000-8000-00805f9b34fb");
    /** GATT servisi. */
    private static final UUID GATT_SERVICE = UUID.fromString("6f1a0001-9d2b-4b1e-9c3a-1f0e2d3c4b5a");
    private static final UUID RX_UUID = UUID.fromString("6f1a0002-9d2b-4b1e-9c3a-1f0e2d3c4b5a");
    private static final UUID TX_UUID = UUID.fromString("6f1a0003-9d2b-4b1e-9c3a-1f0e2d3c4b5a");
    private static final UUID CCCD_UUID = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb");

    private BluetoothManager manager;
    private BluetoothAdapter adapter;

    // Host tarafı
    private BluetoothGattServer server;
    private BluetoothLeAdvertiser advertiser;
    private BluetoothGattService service;
    private BluetoothGattCharacteristic rxChar;
    private BluetoothGattCharacteristic txChar;
    private BluetoothDevice peer;
    private boolean notifying = false;
    private PluginCall hostCall;

    // Guest tarafı
    private BluetoothLeScanner scanner;
    private BluetoothGatt gatt;
    private BluetoothDevice target;
    private PluginCall joinCall;
    private boolean joinResolved = false;
    private boolean scanning = false;

    private String code = "";
    private int mtu = 23;

    private final ArrayDeque<byte[]> outQueue = new ArrayDeque<>();
    private final ByteArrayOutputStream inbox = new ByteArrayOutputStream();
    private boolean sending = false;
    private String pendingAction;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable scanTimeout = () -> {
        stopScan();
        if (!joinResolved) {
            joinResolved = true;
            PluginCall call = joinCall;
            joinCall = null;
            if (call != null) call.reject("Bluetooth odası bulunamadı. Kod doğru mu? İki telefon da yakın mı?");
            notifyError("Bluetooth odası bulunamadı.");
        }
    };

    /* ------------------------------------------------------------------ */
    /* Plugin metodları                                                    */
    /* ------------------------------------------------------------------ */

    @PluginMethod
    public void host(PluginCall call) {
        ensurePermission(call, "host");
    }

    @PluginMethod
    public void join(PluginCall call) {
        ensurePermission(call, "join");
    }

    @PluginMethod
    public void send(PluginCall call) {
        String data = call.getString("data", "");
        if (data.isEmpty()) {
            call.reject("Boş mesaj gönderilemez.");
            return;
        }
        enqueue(data);
        call.resolve();
    }

    @PluginMethod
    public void disconnect(PluginCall call) {
        stopAll();
        call.resolve();
    }

    /* ------------------------------------------------------------------ */
    /* İzinler                                                             */
    /* ------------------------------------------------------------------ */

    private String permissionAlias() {
        return Build.VERSION.SDK_INT >= 31 ? "ble" : "bleLegacy";
    }

    private void ensurePermission(PluginCall call, String action) {
        if (getPermissionState(permissionAlias()) == PermissionState.GRANTED) {
            if ("host".equals(action)) startHost(call);
            else startJoin(call);
            return;
        }
        pendingAction = action;
        requestPermissionForAlias(permissionAlias(), call, "afterPermission");
    }

    @PermissionCallback
    private void afterPermission(PluginCall call) {
        if (getPermissionState(permissionAlias()) != PermissionState.GRANTED) {
            pendingAction = null;
            call.reject("Bluetooth izni verilmedi. Ayarlardan izinleri açabilirsin.");
            return;
        }
        String action = pendingAction;
        pendingAction = null;
        if ("host".equals(action)) startHost(call);
        else startJoin(call);
    }

    /* ------------------------------------------------------------------ */
    /* Host                                                                */
    /* ------------------------------------------------------------------ */

    @SuppressLint("MissingPermission")
    private void startHost(PluginCall call) {
        stopAll();
        code = call.getString("code", "").toUpperCase();
        if (code.isEmpty()) {
            call.reject("Oda kodu gerekli.");
            return;
        }

        manager = (BluetoothManager) getContext().getSystemService(Context.BLUETOOTH_SERVICE);
        adapter = manager != null ? manager.getAdapter() : null;
        if (adapter == null || !adapter.isEnabled()) {
            call.reject("Bluetooth kapalı. Açıp tekrar dene.");
            return;
        }
        if (!adapter.isMultipleAdvertisementSupported()) {
            call.reject("Bu cihaz Bluetooth ile oda kurmayı desteklemiyor. Diğer telefonla oda kurmayı dene.");
            return;
        }

        hostCall = call;
        server = manager.openGattServer(getContext(), serverCallback);
        if (server == null) {
            hostCall = null;
            call.reject("Bluetooth sunucusu açılamadı.");
            return;
        }

        service = new BluetoothGattService(GATT_SERVICE, BluetoothGattService.SERVICE_TYPE_PRIMARY);

        rxChar = new BluetoothGattCharacteristic(
            RX_UUID,
            BluetoothGattCharacteristic.PROPERTY_WRITE | BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE,
            BluetoothGattCharacteristic.PERMISSION_WRITE
        );

        txChar = new BluetoothGattCharacteristic(
            TX_UUID,
            BluetoothGattCharacteristic.PROPERTY_NOTIFY | BluetoothGattCharacteristic.PROPERTY_READ,
            BluetoothGattCharacteristic.PERMISSION_READ
        );
        BluetoothGattDescriptor cccd = new BluetoothGattDescriptor(
            CCCD_UUID,
            BluetoothGattDescriptor.PERMISSION_READ | BluetoothGattDescriptor.PERMISSION_WRITE
        );
        cccd.setValue(BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE);
        txChar.addDescriptor(cccd);

        service.addCharacteristic(rxChar);
        service.addCharacteristic(txChar);

        if (!server.addService(service)) {
            hostCall = null;
            call.reject("Bluetooth servisi eklenemedi.");
        }
    }

    @SuppressLint("MissingPermission")
    private void startAdvertising() {
        advertiser = adapter.getBluetoothLeAdvertiser();
        if (advertiser == null) {
            failHost("Bu cihaz Bluetooth yayını yapamıyor.");
            return;
        }
        AdvertiseSettings settings = new AdvertiseSettings.Builder()
            .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY)
            .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_HIGH)
            .setConnectable(true)
            .setTimeout(0)
            .build();
        AdvertiseData data = new AdvertiseData.Builder()
            .setIncludeDeviceName(false)
            .addServiceUuid(new ParcelUuid(ADV_SERVICE))
            .addServiceData(new ParcelUuid(ADV_SERVICE), code.getBytes(StandardCharsets.UTF_8))
            .build();
        advertiser.startAdvertising(settings, data, advertiseCallback);
    }

    private void failHost(String message) {
        PluginCall call = hostCall;
        hostCall = null;
        notifyError(message);
        if (call != null) call.reject(message);
    }

    private final AdvertiseCallback advertiseCallback = new AdvertiseCallback() {
        @Override
        public void onStartSuccess(AdvertiseSettings settingsInEffect) {
            PluginCall call = hostCall;
            hostCall = null;
            if (call != null) call.resolve();
            notifyListeners("ready", new JSObject());
        }

        @Override
        public void onStartFailure(int errorCode) {
            failHost("Bluetooth yayını başlatılamadı (kod " + errorCode + ").");
        }
    };

    private final BluetoothGattServerCallback serverCallback = new BluetoothGattServerCallback() {
        @Override
        public void onServiceAdded(int status, BluetoothGattService added) {
            if (status == BluetoothGatt.GATT_SUCCESS) startAdvertising();
            else failHost("Bluetooth servisi yüklenemedi.");
        }

        @Override
        public void onConnectionStateChange(BluetoothDevice device, int status, int newState) {
            if (newState == BluetoothProfile.STATE_CONNECTED) {
                peer = device;
                notifyListeners("peer", new JSObject());
            } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                peer = null;
                notifying = false;
                clearOutgoing();
                notifyListeners("closed", new JSObject());
            }
        }

        @Override
        public void onMtuChanged(BluetoothDevice device, int newMtu) {
            mtu = Math.max(23, newMtu);
        }

        @Override
        public void onDescriptorWriteRequest(
            BluetoothDevice device,
            int requestId,
            BluetoothGattDescriptor descriptor,
            boolean preparedWrite,
            boolean responseNeeded,
            int offset,
            byte[] value
        ) {
            if (CCCD_UUID.equals(descriptor.getUuid())) {
                notifying = value != null && value.length > 0 && value[0] != 0;
                peer = device;
                if (notifying) {
                    notifyListeners("peer", new JSObject());
                    pumpHost();
                }
            }
            if (responseNeeded) {
                server.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, 0, null);
            }
        }

        @Override
        public void onCharacteristicWriteRequest(
            BluetoothDevice device,
            int requestId,
            BluetoothGattCharacteristic characteristic,
            boolean preparedWrite,
            boolean responseNeeded,
            int offset,
            byte[] value
        ) {
            if (RX_UUID.equals(characteristic.getUuid()) && value != null) {
                peer = device;
                ingest(value);
            }
            if (responseNeeded) {
                server.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, 0, null);
            }
        }

        @Override
        public void onCharacteristicReadRequest(
            BluetoothDevice device,
            int requestId,
            int offset,
            BluetoothGattCharacteristic characteristic
        ) {
            byte[] value = characteristic.getValue();
            if (value == null) value = new byte[0];
            server.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, offset, value);
        }

        @Override
        public void onNotificationSent(BluetoothDevice device, int status) {
            sending = false;
            if (status == BluetoothGatt.GATT_SUCCESS) pumpHost();
            else {
                clearOutgoing();
                notifyError("Mesaj gönderilemedi.");
            }
        }
    };

    private void pumpHost() {
        if (server == null || peer == null || txChar == null || !notifying || sending) return;
        byte[] chunk;
        synchronized (outQueue) {
            chunk = outQueue.poll();
        }
        if (chunk == null) return;
        sending = true;
        boolean ok;
        if (Build.VERSION.SDK_INT >= 33) {
            ok = server.notifyCharacteristicChanged(peer, txChar, false, chunk);
        } else {
            txChar.setValue(chunk);
            ok = server.notifyCharacteristicChanged(peer, txChar, false);
        }
        if (!ok) {
            sending = false;
            clearOutgoing();
            notifyError("Mesaj gönderilemedi.");
        }
    }

    /* ------------------------------------------------------------------ */
    /* Guest                                                               */
    /* ------------------------------------------------------------------ */

    @SuppressLint("MissingPermission")
    private void startJoin(PluginCall call) {
        stopAll();
        code = call.getString("code", "").toUpperCase();
        if (code.isEmpty()) {
            call.reject("Oda kodu gerekli.");
            return;
        }
        manager = (BluetoothManager) getContext().getSystemService(Context.BLUETOOTH_SERVICE);
        adapter = manager != null ? manager.getAdapter() : null;
        if (adapter == null || !adapter.isEnabled()) {
            call.reject("Bluetooth kapalı. Açıp tekrar dene.");
            return;
        }
        scanner = adapter.getBluetoothLeScanner();
        if (scanner == null) {
            call.reject("Bluetooth taraması başlatılamadı.");
            return;
        }

        joinCall = call;
        joinResolved = false;
        scanning = true;

        ScanFilter filter = new ScanFilter.Builder().setServiceUuid(new ParcelUuid(ADV_SERVICE)).build();
        ScanSettings settings = new ScanSettings.Builder()
            .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
            .build();

        handler.postDelayed(scanTimeout, 20000);
        scanner.startScan(Collections.singletonList(filter), settings, scanCallback);
    }

    @SuppressLint("MissingPermission")
    private void stopScan() {
        scanning = false;
        handler.removeCallbacks(scanTimeout);
        if (scanner != null) {
            try {
                scanner.stopScan(scanCallback);
            } catch (Exception ignored) {
                // tarama zaten kapalı
            }
        }
    }

    private final ScanCallback scanCallback = new ScanCallback() {
        @Override
        public void onScanResult(int callbackType, ScanResult result) {
            if (!scanning) return;
            byte[] data = result.getScanRecord() != null
                ? result.getScanRecord().getServiceData(new ParcelUuid(ADV_SERVICE))
                : null;
            if (data == null) return;
            String found = new String(data, StandardCharsets.UTF_8).trim().toUpperCase();
            if (!found.equals(code)) return;

            stopScan();
            target = result.getDevice();
            notifyListeners("ready", new JSObject());
            if (Build.VERSION.SDK_INT >= 23) {
                gatt = target.connectGatt(getContext(), false, gattCallback, BluetoothDevice.TRANSPORT_LE);
            } else {
                gatt = target.connectGatt(getContext(), false, gattCallback);
            }
            if (gatt == null) failJoin("Bluetooth bağlantısı kurulamadı.");
        }

        @Override
        public void onScanFailed(int errorCode) {
            stopScan();
            failJoin("Bluetooth taraması başarısız (kod " + errorCode + ").");
        }
    };

    @SuppressLint("MissingPermission")
    private final BluetoothGattCallback gattCallback = new BluetoothGattCallback() {
        @Override
        public void onConnectionStateChange(BluetoothGatt g, int status, int newState) {
            if (newState == BluetoothProfile.STATE_CONNECTED) {
                g.discoverServices();
            } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                if (!joinResolved) failJoin("Bluetooth bağlantısı kurulamadı.");
                else notifyListeners("closed", new JSObject());
            }
        }

        @Override
        public void onServicesDiscovered(BluetoothGatt g, int status) {
            if (status != BluetoothGatt.GATT_SUCCESS) {
                failJoin("Bluetooth servisleri okunamadı.");
                return;
            }
            service = g.getService(GATT_SERVICE);
            if (service == null) {
                failJoin("Oyun servisi bulunamadı. Sürümler aynı mı?");
                return;
            }
            rxChar = service.getCharacteristic(RX_UUID);
            txChar = service.getCharacteristic(TX_UUID);
            if (rxChar == null || txChar == null) {
                failJoin("Oyun servisi eksik.");
                return;
            }
            g.requestMtu(517);
            g.setCharacteristicNotification(txChar, true);
            BluetoothGattDescriptor descriptor = txChar.getDescriptor(CCCD_UUID);
            if (descriptor != null) {
                if (Build.VERSION.SDK_INT >= 33) {
                    g.writeDescriptor(descriptor, BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE);
                } else {
                    descriptor.setValue(BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE);
                    g.writeDescriptor(descriptor);
                }
            } else {
                handler.postDelayed(BleTavlaPlugin.this::markJoined, 400);
            }
        }

        @Override
        public void onDescriptorWrite(BluetoothGatt g, BluetoothGattDescriptor descriptor, int status) {
            if (CCCD_UUID.equals(descriptor.getUuid())) markJoined();
        }

        @Override
        public void onMtuChanged(BluetoothGatt g, int newMtu, int status) {
            mtu = Math.max(23, newMtu);
        }

        @Override
        public void onCharacteristicWrite(BluetoothGatt g, BluetoothGattCharacteristic characteristic, int status) {
            sending = false;
            if (status == BluetoothGatt.GATT_SUCCESS) pumpGuest();
            else {
                clearOutgoing();
                notifyError("Mesaj gönderilemedi.");
            }
        }

        @Override
        public void onCharacteristicChanged(BluetoothGatt g, BluetoothGattCharacteristic characteristic) {
            if (TX_UUID.equals(characteristic.getUuid())) ingest(characteristic.getValue());
        }

        @Override
        public void onCharacteristicChanged(
            BluetoothGatt g,
            BluetoothGattCharacteristic characteristic,
            byte[] value
        ) {
            if (TX_UUID.equals(characteristic.getUuid())) ingest(value);
        }
    };

    private void markJoined() {
        if (joinResolved) return;
        joinResolved = true;
        PluginCall call = joinCall;
        joinCall = null;
        if (call != null) call.resolve();
        notifyListeners("peer", new JSObject());
    }

    private void failJoin(String message) {
        stopAll();
        PluginCall call = joinCall;
        joinCall = null;
        if (!joinResolved) {
            joinResolved = true;
            if (call != null) call.reject(message);
        }
        notifyError(message);
    }

    private void pumpGuest() {
        if (gatt == null || rxChar == null || sending) return;
        byte[] chunk;
        synchronized (outQueue) {
            chunk = outQueue.poll();
        }
        if (chunk == null) return;
        sending = true;
        boolean ok;
        if (Build.VERSION.SDK_INT >= 33) {
            ok = gatt.writeCharacteristic(rxChar, chunk, BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT)
                == BluetoothGatt.GATT_SUCCESS;
        } else {
            rxChar.setWriteType(BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT);
            rxChar.setValue(chunk);
            ok = gatt.writeCharacteristic(rxChar);
        }
        if (!ok) {
            sending = false;
            clearOutgoing();
            notifyError("Mesaj gönderilemedi.");
        }
    }

    /* ------------------------------------------------------------------ */
    /* Ortak: çerçeveleme                                                  */
    /* ------------------------------------------------------------------ */

    private void enqueue(String data) {
        byte[] payload = data.getBytes(StandardCharsets.UTF_8);
        ByteBuffer framed = ByteBuffer.allocate(4 + payload.length);
        framed.putInt(payload.length);
        framed.put(payload);
        byte[] bytes = framed.array();

        int chunkSize = Math.max(20, mtu - 3);
        synchronized (outQueue) {
            for (int i = 0; i < bytes.length; i += chunkSize) {
                int len = Math.min(chunkSize, bytes.length - i);
                byte[] part = new byte[len];
                System.arraycopy(bytes, i, part, 0, len);
                outQueue.add(part);
            }
        }
        if (server != null) pumpHost();
        else pumpGuest();
    }

    private void ingest(byte[] chunk) {
        if (chunk == null || chunk.length == 0) return;
        byte[] buffer;
        synchronized (inbox) {
            inbox.write(chunk, 0, chunk.length);
            buffer = inbox.toByteArray();
        }
        List<String> messages = new ArrayList<>();
        int pos = 0;
        while (buffer.length - pos >= 4) {
            int len = ((buffer[pos] & 0xff) << 24)
                | ((buffer[pos + 1] & 0xff) << 16)
                | ((buffer[pos + 2] & 0xff) << 8)
                | (buffer[pos + 3] & 0xff);
            if (len <= 0 || len > 2_000_000) {
                synchronized (inbox) {
                    inbox.reset();
                }
                notifyError("Bozuk Bluetooth mesajı.");
                return;
            }
            if (buffer.length - pos - 4 < len) break;
            messages.add(new String(buffer, pos + 4, len, StandardCharsets.UTF_8));
            pos += 4 + len;
        }
        if (pos > 0) {
            synchronized (inbox) {
                inbox.reset();
                inbox.write(buffer, pos, buffer.length - pos);
            }
        }
        for (String msg : messages) {
            JSObject event = new JSObject();
            event.put("data", msg);
            notifyListeners("message", event);
        }
    }

    private void clearOutgoing() {
        synchronized (outQueue) {
            outQueue.clear();
        }
        sending = false;
    }

    private void notifyError(String message) {
        JSObject event = new JSObject();
        event.put("message", message);
        notifyListeners("error", event);
    }

    @SuppressLint("MissingPermission")
    private void stopAll() {
        stopScan();
        clearOutgoing();
        synchronized (inbox) {
            inbox.reset();
        }
        if (gatt != null) {
            try {
                gatt.disconnect();
                gatt.close();
            } catch (Exception ignored) {
                // bağlantı zaten kapanmış
            }
            gatt = null;
        }
        if (advertiser != null) {
            try {
                advertiser.stopAdvertising(advertiseCallback);
            } catch (Exception ignored) {
                // yayın zaten kapalı
            }
            advertiser = null;
        }
        if (server != null) {
            try {
                server.clearServices();
                server.close();
            } catch (Exception ignored) {
                // sunucu zaten kapalı
            }
            server = null;
        }
        peer = null;
        target = null;
        service = null;
        rxChar = null;
        txChar = null;
        notifying = false;
        joinResolved = false;
        joinCall = null;
        hostCall = null;
        mtu = 23;
    }

    @Override
    protected void handleOnDestroy() {
        stopAll();
        super.handleOnDestroy();
    }
}
