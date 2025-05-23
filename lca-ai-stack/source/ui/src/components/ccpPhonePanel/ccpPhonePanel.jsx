import React, { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import 'amazon-connect-streams';

const CCPPhonePanel = ({ onContactUpdate }) => {
  const ccpContainerRef = useRef();
  const [contact, setContact] = useState(null);

  useEffect(() => {
    const initializeCCP = async () => {
      try {
        const ccpUrl = process.env.REACT_APP_CCP_URL;
        const allowed_origin_1 = process.env.REACT_APP_ALLOWED_ORIGIN_1;
        const allowed_origin_2 = process.env.REACT_APP_ALLOWED_ORIGIN_2;

        window.connect.core.initCCP(ccpContainerRef.current, {
          ccpUrl,
          loginPopup: true,
          loginPopupAutoClose: true,
          softphone: {
            allowFramedSoftphone: true,
            disableRingtone: false,
          },
          ccpAckTimeout: 5000,
          ccpSynTimeout: 3000,
          ccpLoadTimeout: 10000,
          allowFrameAncestors: [ccpUrl, allowed_origin_1, allowed_origin_2, window.location.origin],
        });

        // Subscribe to contact events
        window.connect.contact((contactInstance) => {
          setContact(contactInstance);

          contactInstance.onConnecting((contact) => {
            console.log('Contact connecting');
            const attributes = contact.getAttributes();
            onContactUpdate?.(contact, attributes);
          });

          contactInstance.onConnected(() => {
            console.log('Contact connected');
          });

          contactInstance.onEnded(() => {
            console.log('Contact ended');
            setContact(null);
          });
        });

        // Subscribe to agent events
        window.connect.agent((agent) => {
          console.log('Agent logged in:', agent.getConfiguration().username);

          // Track agent state changes
          agent.onStateChange((agentStateChange) => {
            console.log('Agent state changed:', agentStateChange.newState);
          });
        });
      } catch (error) {
        console.error('Error initializing CCP:', error);
      }
    };

    initializeCCP();
  }, [onContactUpdate]);

  return <div ref={ccpContainerRef} style={{ display: 'none' }} />;
};

CCPPhonePanel.propTypes = {
  onContactUpdate: PropTypes.func,
};

export default CCPPhonePanel;
