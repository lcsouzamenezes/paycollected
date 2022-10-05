import React from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '@mui/material/Button';
// require('dotenv').config();

export default function MagicLink({ planToJoin, setShowMagicLink }) {
  const navigate = useNavigate();

  return (
    <>
      <h1>This is the Magic Link page</h1>
      <div>
        <p>Have other members on your plan join by sharing this link:</p>
        <h3>{`${process.env.CLIENT_HOST}:${process.env.PORT}/join/${planToJoin}`}</h3>
        <Button
          variant="contained"
          onClick={() => {
            setShowMagicLink(false);
            navigate(`/join/${planToJoin}`);
          }}
        >
          Join this plan!
        </Button>
        <Button
          variant="contained"
          onClick={() => { navigate('/dashboard'); }}
        >
          Dashboard
        </Button>
      </div>
    </>
  );
}