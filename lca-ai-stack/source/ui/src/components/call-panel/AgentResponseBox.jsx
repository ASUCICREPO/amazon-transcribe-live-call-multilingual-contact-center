import React, { useState } from 'react';
import Button from '@cloudscape-design/components/button';
import Textarea from '@cloudscape-design/components/textarea';
import Container from '@cloudscape-design/components/container';
import Box from '@cloudscape-design/components/box';
import SpaceBetween from '@cloudscape-design/components/space-between';
import PropTypes from 'prop-types';

const AgentResponseBox = ({ contactId, currentLanguage, currentContact }) => {
  const [agentInput, setAgentInput] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const [debugInfo, setDebugInfo] = useState('');

  const handleSend = async () => {
    if (!contactId) {
      setDebugInfo('No active contact');
      return;
    }

    if (!agentInput.trim()) return;
    setSending(true);
    setSendError('');
    setDebugInfo('Status: Starting translation');

    try {
      // First put the contact on hold
      if (currentContact) {
        console.log('Attempting to put call on hold');
        setDebugInfo('Status: Putting call on hold');
        try {
          await currentContact.getInitialConnection().hold();
          console.log('Call successfully put on hold');
          setDebugInfo('Status: Call on hold');
        } catch (holdError) {
          console.error('Error putting call on hold:', holdError);
          setDebugInfo('Status: Failed to put call on hold');
        }
      }

      // Construct API parameters
      const params = new URLSearchParams({
        txt: agentInput,
        sourceLanguageCode: 'en-US',
        targetLanguageCode: `${currentLanguage}`,
        contactId,
      });

      console.log('API parameters:', params);

      // Add the api url here
      const apiUrl = 'XXXXXXXXXXXXXXXXXXXXX';
      const url = `${apiUrl}hello?${params}`;
      setDebugInfo('Status: Processing translation');

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        mode: 'cors',
      });

      console.log('API response:', response);

      if (!response.ok) {
        throw new Error(`API request failed with status ${response.status}`);
      }

      setDebugInfo('Status: Translation completed');
      const duration = await response.text();
      const durationMs = parseInt(duration, 10) + 3000;

      setDebugInfo('Status: Delivering message');
      await new Promise((resolve) => {
        setTimeout(resolve, durationMs);
      });

      // Resume the call after translation
      if (currentContact) {
        console.log('Attempting to resume call');
        setDebugInfo('Status: Resuming call');
        try {
          await currentContact.getInitialConnection().resume();
          console.log('Call successfully resumed');
          setDebugInfo('Status: Call resumed');
        } catch (resumeError) {
          console.error('Error resuming call:', resumeError);
          setDebugInfo('Status: Failed to resume call');
        }
      }

      setAgentInput('');
      setDebugInfo('Status: Process completed');
    } catch (err) {
      console.error('Translation error:', err);
      setSendError(`Translation failed: ${err.message}`);
      setDebugInfo('Status: Translation failed');

      // Attempt to resume call even if translation failed
      if (currentContact) {
        console.log('Attempting to resume call after error');
        try {
          await currentContact.getInitialConnection().resume();
          console.log('Call successfully resumed after error');
          setDebugInfo('Status: Call resumed after error');
        } catch (resumeError) {
          console.error('Error resuming call after error:', resumeError);
          setDebugInfo('Status: Failed to resume call after error');
        }
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <Container
      header={
        <Box fontWeight="bold" fontSize="heading-s">
          Agent Response
        </Box>
      }
    >
      <SpaceBetween size="m">
        <Textarea
          value={agentInput}
          onChange={({ detail }) => setAgentInput(detail.value)}
          placeholder="Enter Text to be Translated Here"
          aria-label="Agent Response Input"
          rows={4}
          disabled={sending}
        />

        <SpaceBetween size="s" direction="horizontal">
          <Button
            variant="primary"
            onClick={handleSend}
            loading={sending}
            disabled={!agentInput.trim() || sending}
            ariaLabel="Send response"
          >
            Send
          </Button>
        </SpaceBetween>

        {debugInfo && (
          <Box variant="small" color="text-status-info">
            {debugInfo}
          </Box>
        )}

        {sendError && <Box color="text-status-error">{sendError}</Box>}
      </SpaceBetween>
    </Container>
  );
};

AgentResponseBox.propTypes = {
  contactId: PropTypes.string,
  currentLanguage: PropTypes.string,
  currentContact: PropTypes.shape({
    getInitialConnection: PropTypes.func.isRequired,
  }),
};

AgentResponseBox.defaultProps = {
  contactId: '',
  currentLanguage: 'en-US',
  currentContact: null,
};

export default AgentResponseBox;
