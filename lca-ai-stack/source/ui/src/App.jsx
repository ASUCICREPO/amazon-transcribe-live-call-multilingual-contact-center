// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import React, { useState, useEffect } from 'react';
import { Amplify, Logger } from 'aws-amplify';
import { HashRouter } from 'react-router-dom';

import { AppContext } from './contexts/app';

import useUserAuthState from './hooks/use-user-auth-state';
import useAwsConfig from './hooks/use-aws-config';
import useCurrentSessionCreds from './hooks/use-current-session-creds';

import Routes from './routes/Routes';

import '@cloudscape-design/global-styles/index.css';
import './App.css';

import CCPPhonePanel from './components/ccpPhonePanel/ccpPhonePanel';
import getWebSocket, { getSignedUrl } from './utils/aws-utils';

Amplify.Logger.LOG_LEVEL = process.env.NODE_ENV === 'development' ? 'DEBUG' : 'WARNING';
const logger = new Logger('App');

// ------- Adding CCP in the app ----------

const App = () => {
  const awsConfig = useAwsConfig();
  const { authState, user } = useUserAuthState(awsConfig);
  const { currentSession, currentCredentials } = useCurrentSessionCreds({ authState });
  const [errorMessage, setErrorMessage] = useState();
  const [navigationOpen, setNavigationOpen] = useState(true);

  let contId = '';
  let currentContactObject = '';

  const [ccpCredentials, setCcpCredentials] = useState(null);

  const [ws, setWs] = useState(null);
  const [currentContact, setCurrentContact] = useState(null);
  const [contactId, setContactId] = useState('');
  const [connectionId, setConnectionId] = useState('');

  const [transcriptSegments, setTranscriptSegments] = useState({});
  const [currentSegmentId, setCurrentSegmentId] = useState(null);
  const [customerLanguage, setCustomerLanguage] = useState('en-US');

  const processText = (text, isPartial, segID) => {
    console.log('Processing text:', { text, isPartial, segID });

    setTranscriptSegments((prev) => ({
      ...prev,
      [segID]: text,
    }));

    setCurrentSegmentId(segID);

    if (isPartial === 'false') {
      // Segment is complete, prepare for next segment
      setCurrentSegmentId(null);
    }
  };

  // Initialize WebSocket
  const initializeWebSocket = async (wsHost, credentials) => {
    if ('WebSocket' in window) {
      try {
        console.log('WebSocket is supported by your Browser!');
        const url = new URL(wsHost);
        const sigv4 = await getSignedUrl(url.hostname, url.pathname, 'us-west-2', credentials);
        const newWs = new WebSocket(sigv4);

        newWs.onopen = (evt) => {
          console.log('Connection opened:', evt);
          // Initial handshake message
          const message = {
            action: 'newcall',
            data: 'connId@1234|contactId@1234',
          };
          console.log('Sending initial handshake message:', message);
          newWs.send(JSON.stringify(message));
        };

        newWs.onmessage = (evt) => {
          console.log('Raw message received:', evt.data);

          try {
            // First check if the message contains "connectionId" which indicates it's a JSON messag
            if (evt.data.includes('connectionId')) {
              const data = JSON.parse(evt.data);
              console.log('Received connection data:', data);

              if (data.connectionId) {
                console.log('Setting connectionId:', data.connectionId);
                setConnectionId(data.connectionId);

                // If we have both IDs, send the connect message
                if (contId) {
                  const connectMessage = {
                    action: 'sendmessage',
                    data: `conndId@${data.connectionId}|contactId@${contId}`,
                  };
                  console.log('Sending connect message:', connectMessage);
                  newWs.send(JSON.stringify(connectMessage));
                }
              }
            } else {
              // Handle text message format: "text@isPartial@segmentId"
              const messageParts = evt.data.split('@');

              if (messageParts.length >= 3) {
                const [text, isPartial, segmentId] = messageParts;
                console.log('Processing transcript parts:', {
                  text,
                  isPartial,
                  segmentId,
                });

                processText(text, isPartial, segmentId);
              } else {
                console.warn('Received message in unexpected format:', evt.data);
              }
            }
          } catch (err) {
            console.error('Error processing message:', err);
            // Log the actual message that caused the error
            console.error('Problem message:', evt.data);
          }
        };

        setWs(newWs);
        return newWs;
      } catch (error) {
        console.error('Error initializing WebSocket:', error);
        throw error;
      }
    }
    return null;
  };

  // Then, handle the contact updates
  const handleContactUpdate = async (contact, attributes) => {
    console.log('Contact updated:', contact);
    currentContactObject = contact;
    console.log('Current Contact Object: ', currentContactObject);
    console.log('-----Entered handleContactUpdate function----- \n');

    // Store the contact ID
    if (contact?.contactId) {
      setCurrentContact(contact);
      setContactId(contact.contactId);
      contId = contact.contactId;
      console.log('Contact ID -handleContact Update received ---->> : \n', contact.contactId);
      console.log('Contact ID received 2 ---->> :\n', contId);

      // If we already have a connection and haven't sent the message yet, send it now
      if (connectionId && ws) {
        const connectMessage = {
          action: 'sendmessage',
          data: `conndId@${connectionId}|contactId@${contId}`,
        };
        console.log('Contact ID received, sending connect message:', connectMessage);
        ws.send(JSON.stringify(connectMessage));
      }
    }

    if (attributes?.languageCode?.value) {
      console.log('Detected language from Connect:', attributes.languageCode.value);
      setCustomerLanguage(attributes.languageCode.value);
    }

    // Initialize WebSocket if needed
    if (contact?.contactId && attributes?.aid?.value && !ws) {
      const credentials = {
        accessKeyId: attributes.aid.value,
        secretAccessKey: attributes.sak.value,
        sessionToken: attributes.sst.value,
      };

      setCcpCredentials(credentials);

      await initializeWebSocket(getWebSocket(), credentials);
    }
  };

  // Clean up WebSocket on unmount
  useEffect(
    () => () => {
      if (ws) {
        ws.close();
      }
    },
    [ws],
  );

  // eslint-disable-next-line react/jsx-no-constructed-context-values
  const appContextValue = {
    authState,
    awsConfig,
    errorMessage,
    currentCredentials,
    currentSession,
    setErrorMessage,
    user,
    navigationOpen,
    setNavigationOpen,
    // added for AgentResponseBox
    currentContact,
    contactId,
    customerLanguage,
  };
  logger.debug('appContextValue', appContextValue);

  return (
    <div className="App">
      <AppContext.Provider value={appContextValue}>
        <HashRouter>
          <Routes />
        </HashRouter>
        <CCPPhonePanel onContactUpdate={handleContactUpdate} />
      </AppContext.Provider>
    </div>
  );
};

export default App;
