package nativehost

import (
	"encoding/binary"
	"encoding/json"
	"io"
	"os"
)

// Run starts the native messaging host, reading from stdin and writing to stdout
func Run() {
	for {
		msg, err := readMessage(os.Stdin)
		if err != nil {
			if err == io.EOF {
				return
			}
			sendResponse(Response{Success: false, Error: "Failed to read message"})
			continue
		}

		response := handleMessage(msg)
		sendResponse(response)
	}
}

func sendResponse(msg Response) {
	data, err := json.Marshal(msg)
	if err != nil {
		return
	}
	length := uint32(len(data))
	binary.Write(os.Stdout, binary.LittleEndian, length)
	os.Stdout.Write(data)
}

// readMessage reads a Chrome native messaging format message from r
// Format: 4-byte little-endian length + JSON payload
func readMessage(r io.Reader) (Message, error) {
	var length uint32
	if err := binary.Read(r, binary.LittleEndian, &length); err != nil {
		return Message{}, err
	}

	data := make([]byte, length)
	if _, err := io.ReadFull(r, data); err != nil {
		return Message{}, err
	}

	var msg Message
	if err := json.Unmarshal(data, &msg); err != nil {
		return Message{}, err
	}

	return msg, nil
}

