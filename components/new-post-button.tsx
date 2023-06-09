"use client"

import React from "react"
import { BASE_URL } from "@/constants"
import localforage from "localforage"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Icons } from "@/components/icons"

import { toast } from "./ui/use-toast"

export function NewPostButton() {
  const [body, setBody] = React.useState("")
  const [open, setOpen] = React.useState(false)
  const [title, setTitle] = React.useState("")
  const [isLoading, setIsLoading] = React.useState(false)

  const handleSubmit = async () => {
    setIsLoading(true)
    const storedProof = await localforage.getItem<string>("proof")
    const storedPublicSignals = await localforage.getItem<string[]>(
      "publicSignals"
    )
    if (!storedProof || storedPublicSignals?.length === 0) {
      alert("Please generate a proof first")
      return
    }
    const res = await fetch(BASE_URL + "/api/write", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title,
        body: body,
        key: "openai",
        proof: JSON.parse(storedProof),
        publicSignals: storedPublicSignals,
      }),
    })
    if (res.status === 200) {
      setOpen(false)
      setTitle("")
      setBody("")
      toast({
        title: "Success!",
        description: "Your post has been created",
      })
      setIsLoading(false)
    }
  }

  // TODO: change to form
  return (
    <Dialog open={open}>
      <DialogTrigger asChild>
        <Button onClick={() => setOpen(true)} variant="ghost" size="sm">
          <Icons.add />
          <span className="sr-only">New Post</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Create a Post</DialogTitle>
          <DialogDescription>
            Anonymously post while attesting that you&apos;re from [domain here]
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="title" className="text-right">
              Title
            </Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="col-span-3"
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="body" className="text-right">
              Body
            </Label>
            <Textarea
              id="body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="col-span-3"
            />
          </div>
        </div>
        <DialogFooter>
          <Button disabled={isLoading} onClick={() => handleSubmit()}>
            {isLoading && (
              <Icons.spinner className="mr-2 h-4 w-4 animate-spin" />
            )}
            Post
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
