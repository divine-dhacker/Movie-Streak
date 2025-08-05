import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';
import 'package:permission_handler/permission_handler.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  await Permission.camera.request();
  await Permission.microphone.request();
  await Permission.storage.request();

  runApp(const MyApp());
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return const MaterialApp(
      debugShowCheckedModeBanner: false,
      home: WebViewPage(),
    );
  }
}

class WebViewPage extends StatefulWidget {
  const WebViewPage({super.key});

  @override
  State<WebViewPage> createState() => _WebViewPageState();
}

class _WebViewPageState extends State<WebViewPage> {
  InAppWebViewController? webViewController;
  PullToRefreshController? pullToRefreshController;

  @override
  void initState() {
    super.initState();
    pullToRefreshController = PullToRefreshController(
      onRefresh: () async {
        if (webViewController != null) {
          if (defaultTargetPlatform == TargetPlatform.android) {
            webViewController!.reload();
          } else if (defaultTargetPlatform == TargetPlatform.iOS) {
            final url = await webViewController!.getUrl();
            webViewController!.loadUrl(
              urlRequest: URLRequest(url: url),
            );
          }
        }
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: InAppWebView(
        initialUrlRequest: URLRequest(
          url: WebUri("https://divine-dhacker.github.io/Movie-Streak"),
        ),
        initialSettings: InAppWebViewSettings(
          javaScriptEnabled: true,
          mediaPlaybackRequiresUserGesture: false,
          allowsInlineMediaPlayback: true,
        ),
        pullToRefreshController: pullToRefreshController,
        onWebViewCreated: (controller) {
          webViewController = controller;
        },
        onLoadStop: (controller, url) {
          pullToRefreshController?.endRefreshing();
        },
        onPermissionRequest: (controller, request) async {
          return PermissionResponse(
            resources: request.resources,
            action: PermissionResponseAction.GRANT,
          );
        },
      ),
    );
  }
}
