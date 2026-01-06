import { Command, Message, VideoToExtensionCommand } from '@project/common';

export default class TriggerVadAlignmentHandler {
    get sender() {
        return 'asbplayer-video';
    }

    get command() {
        return 'trigger-vad-alignment';
    }

    handle(command: Command<Message>, sender: Browser.runtime.MessageSender) {
        const videoCommand = command as VideoToExtensionCommand<Message>;
        const tabId = sender.tab?.id;

        if (!tabId) {
            console.error('[TriggerVAD] No tab ID from sender');
            return false;
        }

        // Forward as asbplayerv2 command to VAD handler
        const vadCommand = {
            sender: 'asbplayerv2',
            message: {
                command: 'start-vad-alignment',
            },
            tabId,
            src: videoCommand.src,
        };

        // Send to self (background) to be handled by VadAlignmentHandler
        browser.runtime.sendMessage(vadCommand);
        return false;
    }
}
