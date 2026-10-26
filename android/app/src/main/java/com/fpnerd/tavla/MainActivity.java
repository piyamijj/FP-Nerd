package com.fpnerd.tavla;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(BleTavlaPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
