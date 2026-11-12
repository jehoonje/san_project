"use client";

import { useEffect, useRef } from "react";

import { completeOAuthFromUrl } from "@/lib/oauth";
import { supabase } from "@/lib/supabaseClient";

type NativeMessage = {
  type?: string;
  url?: string;
};

type AuthenticatedCallback = () => void;

export function useNativeOAuth(
  onAuthenticated?: AuthenticatedCallback,
) {
  /*
   * 부모 컴포넌트가 다시 렌더링돼도 message listener를
   * 반복해서 제거하고 등록하지 않도록 callback은 ref에 보관합니다.
   */
  const onAuthenticatedRef = useRef(onAuthenticated);

  useEffect(() => {
    onAuthenticatedRef.current = onAuthenticated;
  }, [onAuthenticated]);

  useEffect(() => {
    let processing = false;
    let lastCallbackUrl: string | null = null;
    let mounted = true;

    async function handleMessage(event: MessageEvent) {
      if (typeof event.data !== "string") {
        return;
      }

      let message: NativeMessage;

      try {
        message = JSON.parse(event.data) as NativeMessage;
      } catch {
        return;
      }

      if (message.type === "OAUTH_CANCELED") {
        console.log("[WEB] OAuth 로그인 취소");
        return;
      }

      if (
        message.type !== "OAUTH_CALLBACK" ||
        typeof message.url !== "string"
      ) {
        return;
      }

      /*
       * Android에서는 document와 window 양쪽에서 동일한 메시지를
       * 받을 수 있으므로 같은 callback을 중복 처리하지 않습니다.
       */
      if (
        processing ||
        lastCallbackUrl === message.url
      ) {
        return;
      }

      processing = true;
      lastCallbackUrl = message.url;

      try {
        console.log("[WEB] OAuth 콜백 수신:", message.url);

        /*
         * callback URL의 code를 Supabase 세션으로 교환하거나
         * URL fragment의 토큰으로 세션을 설정합니다.
         */
        const errorMessage = await completeOAuthFromUrl(
          message.url,
        );

        if (errorMessage) {
          console.error(
            "[WEB] OAuth 세션 생성 실패:",
            errorMessage,
          );

          if (mounted) {
            window.alert(
              `로그인을 완료하지 못했습니다.\n${errorMessage}`,
            );
          }

          return;
        }

        /*
         * completeOAuthFromUrl이 성공했다고 반환하더라도
         * 실제 세션이 생성됐는지 한 번 더 확인합니다.
         */
        const {
          data,
          error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError) {
          console.error(
            "[WEB] OAuth 세션 조회 실패:",
            sessionError,
          );

          if (mounted) {
            window.alert(
              "로그인 세션을 확인하지 못했습니다. 다시 시도해 주세요.",
            );
          }

          return;
        }

        if (!data.session) {
          console.error(
            "[WEB] OAuth 처리 후 세션이 없습니다.",
          );

          if (mounted) {
            window.alert(
              "로그인은 완료됐지만 세션이 생성되지 않았습니다. 다시 시도해 주세요.",
            );
          }

          return;
        }

        console.log(
          "[WEB] OAuth 세션 생성 완료:",
          data.session.user.id,
        );

        if (mounted) {
          /*
           * 기존 코드에서 빠졌던 부분입니다.
           * AuthPortal의 이메일 로그인과 동일하게
           * 부모에게 인증 완료를 알립니다.
           */
          onAuthenticatedRef.current?.();
        }
      } catch (error) {
        console.error(
          "[WEB] OAuth 콜백 처리 중 예외 발생:",
          error,
        );

        if (mounted) {
          window.alert(
            "로그인을 완료하지 못했습니다. 다시 시도해 주세요.",
          );
        }
      } finally {
        processing = false;
      }
    }

    const windowListener = (event: MessageEvent) => {
      void handleMessage(event);
    };

    const documentListener = (event: Event) => {
      void handleMessage(event as MessageEvent);
    };

    /*
     * iOS와 Android WebView의 메시지 전달 차이를 고려해
     * window와 document 양쪽에 등록합니다.
     */
    window.addEventListener(
      "message",
      windowListener,
    );

    document.addEventListener(
      "message",
      documentListener,
    );

    return () => {
      mounted = false;

      window.removeEventListener(
        "message",
        windowListener,
      );

      document.removeEventListener(
        "message",
        documentListener,
      );
    };
  }, []);
}